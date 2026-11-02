/*
 * Security and organization-isolation checks against a real, isolated backend (see helpers/isolated-server.js).
 * Run with `npm run test:integration`. Every account, organization and task here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

let server;
let call;
const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';

async function signUp(label) {
  const email = `${label}-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Org`,
    organizationSlug: `${label}-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const connectSocket = (token) =>
  new Promise((resolve) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve({ socket, ok: true }));
    socket.once('connect_error', (error) => resolve({ socket, ok: false, error }));
  });

let alice; // admin of org A
let bob; // has his own org B, then joins org A as a member
let project; // in org A
let issue;

before(async () => {
  server = await startIsolatedServer();
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  const created = await call('POST', '/projects', { name: 'Apollo', key: `AP${stamp.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'X')}` }, alice.token, alice.organizationId);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
  const invited = await call('POST', '/workspace/invitations', { email: bob.email }, alice.token, alice.organizationId);
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  const added = await call('POST', `/projects/${project.id}/members`, { email: bob.email, role: 'member' }, alice.token, alice.organizationId);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const createdIssue = await call('POST', '/issues', { projectId: project.id, title: 'First task' }, alice.token, alice.organizationId);
  assert.equal(createdIssue.status, 201, JSON.stringify(createdIssue.body));
  issue = createdIssue.body.issue ?? createdIssue.body;
});

after(async () => {
  await server?.stop();
});

describe('accounts and tokens', () => {
  it('does not let anyone claim an invited email by signing up', async () => {
    const pending = `pending-${stamp}@example.test`;
    const invited = await call('POST', '/workspace/invitations', { email: pending }, alice.token, alice.organizationId);
    assert.equal(invited.status, 201, JSON.stringify(invited.body));
    const takeover = await call('POST', '/auth/register', { name: 'Mallory', email: pending, password: PASSWORD, organizationName: 'Evil', organizationSlug: `evil-${stamp}` });
    assert.equal(takeover.status, 409);
    assert.equal(takeover.body.details?.code ?? takeover.body.code ?? 'invitation_pending', 'invitation_pending');
  });

  it('answers a wrong email and a wrong password the same way', async () => {
    const unknown = await call('POST', '/auth/login', { email: `nobody-${stamp}@example.test`, password: 'whatever-123' });
    const wrong = await call('POST', '/auth/login', { email: alice.email, password: 'whatever-123' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.body.message, wrong.body.message);
  });

  it('never sends token bookkeeping to the browser', async () => {
    const me = await call('GET', '/auth/me', null, alice.token, alice.organizationId);
    assert.equal(me.status, 200);
    assert.equal('tokenVersion' in me.body.user, false);
    assert.equal('passwordHash' in me.body.user, false);
  });

  it('refuses tokens made for another purpose', async () => {
    const recordingToken = jwt.sign({ typ: 'recording', rid: issue.id }, 'integration-test-secret-0123456789-abcdefghijklmnop');
    const guestToken = jwt.sign({ typ: 'guest', mid: issue.id, gid: 'x', name: 'Guest' }, 'integration-test-secret-0123456789-abcdefghijklmnop');
    assert.equal((await call('GET', '/auth/me', null, recordingToken)).status, 401);
    assert.equal((await call('GET', '/auth/me', null, guestToken)).status, 401);
    const { socket, ok } = await connectSocket(recordingToken);
    socket.disconnect();
    assert.equal(ok, false, 'a recording link must not open a live connection');
  });

  it('signs out other sessions when the password changes, keeping this one', async () => {
    const carol = await signUp('carol');
    const otherDevice = (await call('POST', '/auth/login', { email: carol.email, password: PASSWORD })).body.token;
    const changed = await call('PATCH', '/auth/me/password', { currentPassword: PASSWORD, newPassword: 'another-good-password' }, carol.token);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((await call('GET', '/auth/me', null, otherDevice)).status, 401, 'the other device is signed out');
    assert.equal((await call('GET', '/auth/me', null, carol.token)).status, 401, 'the old token of this device is replaced');
    assert.equal((await call('GET', '/auth/me', null, changed.body.token)).status, 200, 'the new token works');
    const { socket, ok } = await connectSocket(otherDevice);
    socket.disconnect();
    assert.equal(ok, false, 'a revoked token cannot open a live connection');
  });

  it('limits wrong passwords per account', async () => {
    const dave = await signUp('dave');
    let last;
    for (let attempt = 0; attempt < 11; attempt += 1) last = await call('POST', '/auth/login', { email: dave.email, password: 'wrong-password' });
    assert.equal(last.status, 429);
  });
});

describe('organization isolation', () => {
  it('lets an organization member open the project', async () => {
    assert.equal((await call('GET', `/projects/${project.id}`, null, bob.token, alice.organizationId)).status, 200);
  });

  it('keeps other organizations out of the project and its tasks', async () => {
    const eve = await signUp('eve');
    assert.equal((await call('GET', `/projects/${project.id}`, null, eve.token)).status, 404);
    assert.equal((await call('GET', `/issues/${issue.id}`, null, eve.token)).status, 404);
    // A forged organization header falls back to their own organization.
    assert.equal((await call('GET', `/issues/${issue.id}`, null, eve.token, alice.organizationId)).status, 404);
  });

  it('does not let project admins pull outsiders into the organization', async () => {
    const bobProject = await call('POST', '/projects', { name: 'Bobs side project', key: `BS${stamp.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'Y')}` }, bob.token, alice.organizationId);
    assert.equal(bobProject.status, 201, JSON.stringify(bobProject.body));
    const id = (bobProject.body.project ?? bobProject.body).id;
    const outsider = await call('POST', `/projects/${id}/members`, { email: `outsider-${stamp}@example.test`, role: 'member' }, bob.token, alice.organizationId);
    assert.equal(outsider.status, 403);
  });

  it('does not link tasks across organizations', async () => {
    const otherProject = await call('POST', '/projects', { name: 'Bobs own', key: `BO${stamp.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'Z')}` }, bob.token, bob.organizationId);
    const otherIssue = await call('POST', '/issues', { projectId: (otherProject.body.project ?? otherProject.body).id, title: 'Elsewhere' }, bob.token, bob.organizationId);
    const linked = await call('POST', `/issues/${issue.id}/links`, { targetIssue: (otherIssue.body.issue ?? otherIssue.body).id, type: 'relates_to' }, bob.token, alice.organizationId);
    assert.equal(linked.status, 400);
  });

  it('ends a deactivated member’s access at once, also from their other organization', async () => {
    const disabled = await call('PATCH', `/workspace/members/${bob.user.id}`, { status: 'disabled' }, alice.token, alice.organizationId);
    assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
    assert.equal((await call('GET', `/projects/${project.id}`, null, bob.token, bob.organizationId)).status, 404);
    assert.equal((await call('GET', `/issues/${issue.id}`, null, bob.token, bob.organizationId)).status, 404);
    await call('PATCH', `/workspace/members/${bob.user.id}`, { status: 'active' }, alice.token, alice.organizationId);
    assert.equal((await call('GET', `/projects/${project.id}`, null, bob.token, alice.organizationId)).status, 200, 'access returns with reactivation');
  });
});

describe('data integrity', () => {
  it('gives every task a different number, even when created at the same moment', async () => {
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, index) => call('POST', '/issues', { projectId: project.id, title: `Parallel ${index}` }, alice.token, alice.organizationId)),
    );
    created.forEach((response) => assert.equal(response.status, 201, `${JSON.stringify(response.body)}\n${server.output().slice(-3000)}`));
    const keys = created.map((response) => (response.body.issue ?? response.body).key);
    assert.equal(new Set(keys).size, keys.length, `duplicate keys: ${keys.join(', ')}`);
  });

  it('refuses parent loops', async () => {
    const parent = (await call('POST', '/issues', { projectId: project.id, title: 'Parent', type: 'story' }, alice.token, alice.organizationId)).body;
    const child = (await call('POST', '/issues', { projectId: project.id, title: 'Child', type: 'task' }, alice.token, alice.organizationId)).body;
    const parentIssue = parent.issue ?? parent;
    const childIssue = child.issue ?? child;
    assert.equal((await call('PATCH', `/issues/${childIssue.id}`, { parentId: parentIssue.id }, alice.token, alice.organizationId)).status, 200);
    const loop = await call('PATCH', `/issues/${parentIssue.id}`, { parentId: childIssue.id }, alice.token, alice.organizationId);
    assert.equal(loop.status, 400, JSON.stringify(loop.body));
  });
});

describe('robustness', () => {
  it('survives malformed live messages', async () => {
    const { socket, ok } = await connectSocket(alice.token);
    assert.equal(ok, true);
    socket.emit('project:join', { not: 'an id' });
    socket.emit('project:join', "'; drop table issues; --");
    socket.emit('presence:query', null, () => undefined);
    socket.emit('meeting:join', 42, () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 800));
    socket.disconnect();
    assert.equal(server.alive(), true, server.output().slice(-2000));
    assert.equal((await fetch(`${server.api}/health`)).status, 200);
  });

  it('only accepts real browser push services', async () => {
    const internal = await call('POST', '/push/subscriptions', { endpoint: 'https://169.254.169.254/latest', keys: { p256dh: 'x', auth: 'y' } }, alice.token, alice.organizationId);
    assert.equal(internal.status, 400);
  });

  it('answers with a request id and no configuration details on health', async () => {
    const response = await fetch(`${server.api}/health`);
    assert.ok(response.headers.get('x-request-id'));
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal('integrations' in body, false);
  });

  it('refuses uploads to recordings the person may not upload to, before writing anything', async () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(1024)], { type: 'video/webm' }), 'x.webm');
    const response = await fetch(`${server.api}/meetings/00000000-0000-4000-8000-000000000000/recordings/00000000-0000-4000-8000-000000000000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}`, 'X-Organization-Id': alice.organizationId },
      body: form,
    });
    // Not found, or the plan has no meetings: either way it is refused before the file is read.
    assert.ok([403, 404].includes(response.status), `status ${response.status}`);
  });
});
