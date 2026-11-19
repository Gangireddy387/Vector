/*
 * Project dependencies graph: blocks links, critical path, access control.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-deps-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let bob;
let project;
let first;
let second;

async function signUp(label) {
  const email = `${label}-deps-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Deps Org`,
    organizationSlug: `${label}-deps-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer({
    env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password },
  });
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);

  const created = await asAlice('POST', '/projects', { name: 'Deps Project', key: 'DEP' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  const a = await asAlice('POST', '/issues', { projectId: project.id, title: 'Write API', estimateMinutes: 120 });
  const b = await asAlice('POST', '/issues', { projectId: project.id, title: 'Build UI', estimateMinutes: 180 });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(b.status, 201, JSON.stringify(b.body));
  first = a.body.issue;
  second = b.body.issue;

  const linked = await asAlice('POST', `/issues/${first.id}/links`, { targetIssue: second.id, type: 'blocks' });
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
});

after(async () => {
  await server?.stop();
});

describe('project dependencies', () => {
  it('returns the blocks graph and critical path for project members', async () => {
    const response = await asAlice('GET', `/projects/${project.id}/dependencies`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.stats.blockLinks, 1);
    assert.deepEqual(response.body.criticalPath.issueIds, [first.id, second.id]);
    assert.equal(response.body.criticalPath.lengthMinutes, 300);
    assert.equal(response.body.blockedNow.length, 1);
    assert.equal(response.body.blockedNow[0].id, second.id);
  });

  it('keeps other organizations out', async () => {
    const response = await call('GET', `/projects/${project.id}/dependencies`, null, bob.token, bob.organizationId);
    assert.ok([403, 404].includes(response.status), `status ${response.status}`);
  });
});
