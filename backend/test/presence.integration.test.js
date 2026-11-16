/*
 * Teams-style presence against an isolated backend: available, idle/away, chosen dnd, appear offline, and query.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ROOT = { email: `root-presence-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let bob;
let aliceSocket;
let bobSocket;

async function signUp(label) {
  const email = `${label}-presence-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Presence Org`,
    organizationSlug: `${label}-presence-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const ask = (socket, event, payload = {}) =>
  new Promise((resolve) => socket.timeout(5000).emit(event, payload, (error, response) => resolve(error ? { ok: false } : response)));

const changeOf = (socket, userId, status, ms = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('presence:changed', listener);
      reject(new Error(`no presence ${status} for ${userId}`));
    }, ms);
    function listener(event) {
      if (event.userId !== userId || event.status !== status) return;
      clearTimeout(timer);
      socket.off('presence:changed', listener);
      resolve(event);
    }
    socket.on('presence:changed', listener);
  });

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ROOT.email, SUPER_ADMIN_PASSWORD: ROOT.password } });
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  const root = (await call('POST', '/auth/login', ROOT)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  assert.equal((await call('POST', '/workspace/invitations', { email: bob.email }, alice.token, alice.organizationId)).status, 201);

  aliceSocket = await connect(alice.token);
  const online = changeOf(aliceSocket, bob.user.id, 'available');
  bobSocket = await connect(bob.token);
  await ask(bobSocket, 'presence:choose', { status: null });
  await online;
});

after(async () => {
  aliceSocket?.disconnect();
  bobSocket?.disconnect();
  await server?.stop();
});

describe('presence', () => {
  it('answers presence queries', async () => {
    const queried = await ask(aliceSocket, 'presence:query', { userIds: [bob.user.id] });
    assert.equal(queried.ok, true);
    assert.equal(queried.presence?.[bob.user.id]?.status, 'available');
  });

  it('shows idle as away and activity as available again', async () => {
    const away = changeOf(aliceSocket, bob.user.id, 'away');
    bobSocket.emit('presence:idle', { idle: true });
    await away;
    const back = changeOf(aliceSocket, bob.user.id, 'available');
    bobSocket.emit('presence:idle', { idle: false });
    await back;
  });

  it('broadcasts chosen dnd and appear-offline', async () => {
    const dnd = changeOf(aliceSocket, bob.user.id, 'dnd');
    const chose = await ask(bobSocket, 'presence:choose', { status: 'dnd' });
    assert.equal(chose.ok, true);
    await dnd;

    const ghost = changeOf(aliceSocket, bob.user.id, 'offline');
    assert.equal((await ask(bobSocket, 'presence:choose', { status: 'offline' })).ok, true);
    await ghost;

    const auto = changeOf(aliceSocket, bob.user.id, 'available');
    assert.equal((await ask(bobSocket, 'presence:choose', { status: null })).ok, true);
    await auto;
  });
});
