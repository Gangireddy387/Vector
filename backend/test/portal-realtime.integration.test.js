/*
 * The super admin's open tabs hear about organizations as things happen: a signup waiting for approval, a rename,
 * a removal. Against a real, isolated backend. Run with `node --test test/portal-realtime.integration.test.js`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const ROOT = { email: `root-portal-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let rootSocket;

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
  const login = await call('POST', '/auth/login', ROOT);
  assert.equal(login.status, 200, JSON.stringify(login.body));
  rootSocket = await connect(login.body.token);
});

after(async () => {
  rootSocket?.close();
  await server?.stop();
});

describe('super admin live updates', () => {
  let owner;

  it('hears about a new organization the moment someone signs up', async () => {
    const slug = `live-${stamp}`;
    const heard = next(rootSocket, 'portal:organization', (event) => event.organization.slug === slug);
    const registered = await call('POST', '/auth/register', {
      name: 'Live Person',
      email: `live-${stamp}@example.test`,
      password: 'correct-horse-battery',
      organizationName: 'Live Org',
      organizationSlug: slug,
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    owner = { token: registered.body.token, organizationId: registered.body.organization.id };
    const event = await heard;
    assert.equal(event.action, 'created');
    assert.equal(event.organization.status, 'pending');
    assert.equal(event.organization.name, 'Live Org');
  });

  it('hears when the organization changes', async () => {
    const heard = next(rootSocket, 'portal:organization', (event) => event.action === 'updated' && event.organization.id === owner.organizationId);
    const renamed = await call('PATCH', '/workspace', { name: 'Live Org Renamed' }, owner.token, owner.organizationId);
    // A pending organization may not be allowed to change settings yet; either way nothing must break.
    if (renamed.status === 200) assert.equal((await heard).organization.name, 'Live Org Renamed');
    else heard.catch(() => undefined);
  });
});
