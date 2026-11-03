/*
 * Who may run a project's sprints, against a real, isolated backend: its admins and its lead may plan, start and
 * complete sprints; other members work inside them but cannot start or complete them.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);

let server;
let call;
let alice; // organization admin, creates the project
let bob; // project member
let project;
let sprint;

async function signUp(label) {
  const email = `${label}-sprint-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: 'correct-horse-battery',
    organizationName: `${label} Sprint Org`,
    organizationSlug: `${label}-sprint-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);
const asBob = (method, url, body) => call(method, url, body, bob.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer();
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  const created = await asAlice('POST', '/projects', { name: 'Sprinting', key: 'SPR' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email })).status, 201);
  assert.equal((await asAlice('POST', `/projects/${project.id}/members`, { email: bob.email, role: 'member' })).status, 201);
});

after(async () => {
  await server?.stop();
});

describe('sprint management', () => {
  it('tells each person whether they can manage sprints', async () => {
    assert.equal((await asAlice('GET', `/projects/${project.id}`)).body.project.canManageSprints, true);
    assert.equal((await asBob('GET', `/projects/${project.id}`)).body.project.canManageSprints, false);
  });

  it('lets a project admin create and start a sprint', async () => {
    const created = await asAlice('POST', `/projects/${project.id}/sprints`, { name: 'Sprint 1' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    sprint = created.body.sprint;
    assert.equal((await asAlice('POST', `/projects/${project.id}/sprints/${sprint.id}/start`, {})).status, 200);
  });

  it('does not let an ordinary member create, edit or complete sprints', async () => {
    assert.equal((await asBob('POST', `/projects/${project.id}/sprints`, { name: 'Mine' })).status, 403);
    assert.equal((await asBob('PATCH', `/projects/${project.id}/sprints/${sprint.id}`, { name: 'Renamed' })).status, 403);
    assert.equal((await asBob('POST', `/projects/${project.id}/sprints/${sprint.id}/complete`, {})).status, 403);
    assert.equal((await asBob('GET', `/projects/${project.id}/sprints`)).status, 200, 'members still see the sprints');
  });

  it('lets the project lead complete the sprint', async () => {
    assert.equal((await asAlice('PATCH', `/projects/${project.id}`, { leadId: bob.user.id })).status, 200);
    assert.equal((await asBob('GET', `/projects/${project.id}`)).body.project.canManageSprints, true);
    const completed = await asBob('POST', `/projects/${project.id}/sprints/${sprint.id}/complete`, {});
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(completed.body.sprint.state, 'completed');
  });
});
