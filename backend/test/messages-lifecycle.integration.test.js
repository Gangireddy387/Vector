/*
 * Direct-message lifecycle against an isolated backend: open DM, send, edit (+ history), hide, clear, search,
 * read receipts over the socket, and validation / bad UUID handling.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ROOT = { email: `root-dm-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let bob;

async function signUp(label) {
  const email = `${label}-dm-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} DM Org`,
    organizationSlug: `${label}-dm-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);
const asBob = (method, url, body) => call(method, url, body, bob.token, alice.organizationId);

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const next = (socket, event, filter = () => true, ms = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`no ${event} within ${ms} ms`));
    }, ms);
    function handler(payload) {
      if (!filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ROOT.email, SUPER_ADMIN_PASSWORD: ROOT.password } });
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  const root = (await call('POST', '/auth/login', ROOT)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { directMessages: true } }, root)).status,
    200,
  );
  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email })).status, 201);
});

after(async () => {
  await server?.stop();
});

describe('direct message lifecycle', () => {
  let conversationId;
  let messageId;
  let bobSocket;

  before(async () => {
    bobSocket = await connect(bob.token);
  });

  after(() => {
    bobSocket?.disconnect();
  });

  it('opens a DM and delivers a message over the socket', async () => {
    const opened = await asAlice('POST', '/conversations/direct', { userId: bob.user.id });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    conversationId = opened.body.conversation.id;

    const incoming = next(bobSocket, 'conversation:message', (payload) => payload.conversationId === conversationId);
    const sent = await asAlice('POST', `/conversations/${conversationId}/messages`, { body: 'Hello Bob unique-token' });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    messageId = sent.body.message.id;
    const delivered = await incoming;
    assert.equal(delivered.id, messageId);
  });

  it('edits a message, keeps history, and rejects empty edits', async () => {
    const edited = await asAlice('PATCH', `/conversations/${conversationId}/messages/${messageId}`, { body: 'Hello Bob — edited' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.ok(edited.body.message.editedAt);
    assert.equal(edited.body.message.body, 'Hello Bob — edited');

    const history = await asAlice('GET', `/conversations/${conversationId}/messages/${messageId}/history`);
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(history.body.revisions.some((row) => row.body.includes('unique-token')));

    assert.equal((await asAlice('PATCH', `/conversations/${conversationId}/messages/${messageId}`, { body: '   ' })).status, 400);
  });

  it('searches message bodies and pages with before', async () => {
    const found = await asAlice('GET', `/conversations/${conversationId}/messages/search?q=${encodeURIComponent('edited')}`);
    assert.equal(found.status, 200, JSON.stringify(found.body));
    assert.ok(found.body.messages.some((row) => row.id === messageId));

    const thread = await asAlice('GET', `/conversations/${conversationId}`);
    assert.equal(thread.status, 200);
    assert.equal(typeof thread.body.hasMore, 'boolean');
  });

  it('hides and clears for one person only, and marks read for the other', async () => {
    const readEvent = next(bobSocket, 'conversation:read', (payload) => payload.conversationId === conversationId && payload.userId === alice.user.id);
    assert.equal((await asAlice('POST', `/conversations/${conversationId}/read`)).status, 200);
    const read = await readEvent;
    assert.ok(read.readAt);

    const hidden = await asBob('POST', `/conversations/${conversationId}/messages/${messageId}/hide`);
    assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
    // Idempotent hide.
    assert.equal((await asBob('POST', `/conversations/${conversationId}/messages/${messageId}/hide`)).status, 200);

    const bobThread = await asBob('GET', `/conversations/${conversationId}`);
    assert.ok(!bobThread.body.messages.some((row) => row.id === messageId));

    const aliceThread = await asAlice('GET', `/conversations/${conversationId}`);
    assert.ok(aliceThread.body.messages.some((row) => row.id === messageId));

    assert.equal((await asBob('POST', `/conversations/${conversationId}/clear`)).status, 200);
    const cleared = await asBob('GET', `/conversations/${conversationId}`);
    assert.equal(cleared.body.messages.length, 0);

    const afterClear = await asAlice('POST', `/conversations/${conversationId}/messages`, { body: 'After clear' });
    assert.equal(afterClear.status, 201);
    const bobAgain = await asBob('GET', `/conversations/${conversationId}`);
    assert.ok(bobAgain.body.messages.some((row) => row.body === 'After clear'));
  });

  it('rejects bad UUIDs and empty sends', async () => {
    assert.equal((await asAlice('GET', '/conversations/not-a-uuid')).status, 400);
    assert.equal((await asAlice('POST', `/conversations/${conversationId}/messages`, { body: '' })).status, 400);
    assert.equal((await asAlice('POST', `/conversations/${conversationId}/messages/${messageId}/reactions`, { emoji: 'not-real' })).status, 400);
  });
});
