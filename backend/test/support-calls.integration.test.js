/*
 * Video calls between the Vector team (super admin) and an organization's admins, against a real, isolated backend:
 * starting from either side, ringing, joining without belonging to the organization, who is kept out, and ending.
 * Run with `node --test test/support-calls.integration.test.js`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ROOT = { email: `root-calls-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner; // the organization's admin
let member; // a regular member of the same organization
let outsider; // admin of another organization
let root;
const sockets = [];

async function signUp(label, slugLabel = label) {
  const email = `${label}-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${slugLabel} Org`,
    organizationSlug: `${slugLabel}-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => {
      sockets.push(socket);
      resolve(socket);
    });
    socket.once('connect_error', reject);
  });

const ask = (socket, event, payload = {}) =>
  new Promise((resolve) => socket.timeout(8000).emit(event, payload, (error, response) => resolve(error ? { ok: false, error: 'timeout' } : response)));

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

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);
const asRoot = (method, url, body) => call(method, url, body, root.token);

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ROOT.email, SUPER_ADMIN_PASSWORD: ROOT.password } });
  call = apiClient(server.api);
  owner = await signUp('owner');
  outsider = await signUp('outsider');
  const login = await call('POST', '/auth/login', ROOT);
  root = { token: login.body.token, user: login.body.user };
  for (const organizationId of [owner.organizationId, outsider.organizationId]) {
    assert.equal((await asRoot('POST', `/super-admin/organizations/${organizationId}/approve`)).status, 200);
  }
  // A regular member of the owner's organization.
  const invited = await asOwner('POST', '/workspace/invitations', { email: `member-${stamp}@example.test`, role: 'member' });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  member = { token: null, id: invited.body.member.id };
});

after(async () => {
  for (const socket of sockets) socket.close();
  await server?.stop();
});

describe('support calls', () => {
  let meetingId;
  let rootSocket;

  it('lets the super admin call an organization, ringing its admins with their own link', async () => {
    const ownerSocket = await connect(owner.token);
    const ringing = next(ownerSocket, 'meeting:ringing');
    const started = await asRoot('POST', '/support-calls', { organizationId: owner.organizationId });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.equal(started.body.started, true);
    meetingId = started.body.call.id;
    assert.equal(started.body.call.url, `/super-admin/call/${meetingId}`);
    const card = await ringing;
    assert.equal(card.meeting.id, meetingId);
    assert.equal(card.url, `/support-call/${meetingId}`);
  });

  it('shows the call in the support chat on both sides, with a notice', async () => {
    const ownerThread = (await asOwner('GET', '/workspace/support')).body;
    assert.equal(ownerThread.call?.id, meetingId);
    assert.equal(ownerThread.call.url, `/support-call/${meetingId}`);
    assert.ok(ownerThread.messages.some((message) => message.kind === 'system' && /video call/.test(message.body)));
    const rootThread = (await asRoot('GET', `/super-admin/organizations/${owner.organizationId}/support`)).body;
    assert.equal(rootThread.call?.url, `/super-admin/call/${meetingId}`);
  });

  it('joins the same call instead of starting a second one', async () => {
    const again = await asOwner('POST', '/support-calls', {});
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.started, false);
    assert.equal(again.body.call.id, meetingId);
  });

  it('gives both sides the call page details, and nobody else', async () => {
    const forRoot = await asRoot('GET', `/support-calls/${meetingId}`);
    assert.equal(forRoot.status, 200, JSON.stringify(forRoot.body));
    assert.equal(forRoot.body.side, 'portal');
    assert.equal(forRoot.body.joinable, true);
    assert.ok(Array.isArray(forRoot.body.ice.iceServers));
    const forOwner = await asOwner('GET', `/support-calls/${meetingId}`);
    assert.equal(forOwner.body.side, 'organization');
    const forOutsider = await call('GET', `/support-calls/${meetingId}`, null, outsider.token, outsider.organizationId);
    assert.equal(forOutsider.status, 404);
  });

  it('lets the super admin and the organization admin join the call, without the organization membership rule', async () => {
    rootSocket = await connect(root.token);
    const ownerSocket = await connect(owner.token);
    const rootJoined = await ask(rootSocket, 'meeting:join', { meetingId, media: { audio: false, video: false } });
    assert.equal(rootJoined.ok, true, JSON.stringify(rootJoined));
    assert.equal(rootJoined.canManage, true);
    const ownerJoined = await ask(ownerSocket, 'meeting:join', { meetingId, media: { audio: false, video: false } });
    assert.equal(ownerJoined.ok, true, JSON.stringify(ownerJoined));
    assert.ok(ownerJoined.peers.some((peer) => peer.user.id === root.user.id), 'the organization admin sees the Vector team in the call');
  });

  it('keeps out admins of other organizations', async () => {
    const outsiderSocket = await connect(outsider.token);
    const denied = await ask(outsiderSocket, 'meeting:join', { meetingId, media: { audio: false, video: false } });
    assert.equal(denied.ok, false);
  });

  it('only lets organization admins (not regular members) call the Vector team', async () => {
    assert.ok(member.id);
    // The outsider joins the owner's organization as a regular member.
    const added = await asOwner('POST', '/workspace/invitations', { email: outsider.email, role: 'member' });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    const asRegular = await call('POST', '/support-calls', {}, outsider.token, owner.organizationId);
    assert.equal(asRegular.status, 403, JSON.stringify(asRegular.body));
    const page = await call('GET', `/support-calls/${meetingId}`, null, outsider.token, owner.organizationId);
    assert.equal(page.status, 404, 'regular members do not see the call either');
  });

  describe('recordings', () => {
    let message;

    const uploadAsRoot = (recordingId) => {
      const form = new FormData();
      form.append('durationSeconds', '754');
      form.append('file', new Blob([Buffer.alloc(2048, 1)], { type: 'video/webm' }), 'recording.webm');
      return fetch(`${server.api}/support-calls/${meetingId}/recordings/${recordingId}`, { method: 'POST', headers: { Authorization: `Bearer ${root.token}` }, body: form });
    };

    it('saves a recording of the call into the support chat for both sides', async () => {
      const started = await ask(rootSocket, 'meeting:recording', { on: true });
      assert.equal(started.ok, true, JSON.stringify(started));
      await ask(rootSocket, 'meeting:recording', { on: false });

      const ownerSocket = await connect(owner.token);
      const live = next(ownerSocket, 'support:message', (payload) => payload.kind === 'recording');
      const uploaded = await uploadAsRoot(started.recordingId);
      const body = await uploaded.json();
      assert.equal(uploaded.status, 201, JSON.stringify(body));
      message = body.message;
      assert.equal(message.kind, 'recording');
      assert.equal(message.recording.id, started.recordingId);
      assert.equal(message.recording.durationSeconds, 754);
      assert.equal(message.body, 'Call recording · 12 min 34 s');
      assert.equal((await live).id, message.id, 'the organization admin gets it live');

      const ownerThread = (await asOwner('GET', '/workspace/support')).body;
      assert.ok(ownerThread.messages.some((item) => item.id === message.id && item.recording?.id === started.recordingId));
      assert.ok(ownerThread.unread >= 0);
    });

    it('lets both sides watch it later through a link, and nobody else', async () => {
      for (const asSide of [asOwner, asRoot]) {
        const link = await asSide('GET', `/support-calls/${meetingId}/recordings/${message.recording.id}/link`);
        assert.equal(link.status, 200, JSON.stringify(link.body));
        const file = await fetch(`${server.base}${link.body.url}`);
        assert.equal(file.status, 200);
        assert.equal((await file.arrayBuffer()).byteLength, 2048);
      }
      const outsiderLink = await call('GET', `/support-calls/${meetingId}/recordings/${message.recording.id}/link`, null, outsider.token, owner.organizationId);
      assert.equal(outsiderLink.status, 404);
    });

    it('does not let anyone else upload into a recording', async () => {
      const started = await ask(rootSocket, 'meeting:recording', { on: true });
      await ask(rootSocket, 'meeting:recording', { on: false });
      const form = new FormData();
      form.append('file', new Blob([Buffer.alloc(16)], { type: 'video/webm' }), 'x.webm');
      const sneaky = await fetch(`${server.api}/support-calls/${meetingId}/recordings/${started.recordingId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.token}`, 'X-Organization-Id': owner.organizationId },
        body: form,
      });
      assert.equal(sneaky.status, 403);
      assert.equal((await asRoot('DELETE', `/support-calls/${meetingId}/recordings/${started.recordingId}`)).status, 204);
    });

    it('lets the person who recorded delete it for everyone, which removes the file', async () => {
      const deleted = await asRoot('DELETE', `/super-admin/organizations/${owner.organizationId}/support/messages/${message.id}`);
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
      assert.ok(deleted.body.message.deletedAt);
      assert.equal(deleted.body.message.recording, null);
      const link = await asOwner('GET', `/support-calls/${meetingId}/recordings/${message.recording.id}/link`);
      assert.equal(link.status, 404);
    });
  });

  it('lets either side end the call for everyone', async () => {
    const ended = await asOwner('POST', `/support-calls/${meetingId}/end`);
    assert.equal(ended.status, 200, JSON.stringify(ended.body));
    assert.equal(ended.body.joinable, false);
    const thread = (await asOwner('GET', '/workspace/support')).body;
    assert.equal(thread.call, null);
  });
});
