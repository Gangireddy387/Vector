/*
 * Field-level issue ACL: project settings restrict who may patch which fields.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);

let server;
let call;
let alice;
let bob;
let project;
let issue;

async function signUp(label) {
  const email = `${label}-facl-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: 'correct-horse-battery',
    organizationName: `${label} Field ACL Org`,
    organizationSlug: `${label}-facl-${stamp}`.toLowerCase(),
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

  const created = await asAlice('POST', '/projects', { name: 'ACL Project', key: 'ACL' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email })).status, 201);
  assert.equal((await asAlice('POST', `/projects/${project.id}/members`, { email: bob.email, role: 'member' })).status, 201);

  const made = await asAlice('POST', '/issues', {
    projectId: project.id,
    title: 'ACL task',
    type: 'task',
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;

  const settings = await asAlice('PATCH', `/projects/${project.id}`, {
    settings: {
      ...project.settings,
      fieldPermissions: { assigneeId: ['admin'], priority: ['admin', 'scrum_master'] },
    },
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.body));
  project = settings.body.project ?? settings.body;
});

after(async () => {
  await server?.stop();
});

describe('issue field ACL API', () => {
  it('exposes editableIssueFields on project detail', async () => {
    const adminView = await asAlice('GET', `/projects/${project.id}`);
    assert.equal(adminView.status, 200, JSON.stringify(adminView.body));
    const adminFields = adminView.body.project.editableIssueFields;
    assert.equal(adminFields.assigneeId, true);
    assert.equal(adminFields.priority, true);
    assert.equal(adminFields.title, true);

    const memberView = await asBob('GET', `/projects/${project.id}`);
    assert.equal(memberView.status, 200, JSON.stringify(memberView.body));
    const memberFields = memberView.body.project.editableIssueFields;
    assert.equal(memberFields.assigneeId, false);
    assert.equal(memberFields.priority, false);
    assert.equal(memberFields.title, true);
  });

  it('blocks members from restricted fields and allows title edits', async () => {
    const forbidden = await asBob('PATCH', `/issues/${issue.id}`, { assigneeId: bob.user.id });
    assert.equal(forbidden.status, 403, JSON.stringify(forbidden.body));

    const titleOk = await asBob('PATCH', `/issues/${issue.id}`, { title: 'Member can still edit title' });
    assert.equal(titleOk.status, 200, JSON.stringify(titleOk.body));
    assert.equal(titleOk.body.issue.title, 'Member can still edit title');

    const adminOk = await asAlice('PATCH', `/issues/${issue.id}`, { assigneeId: alice.user.id, priority: 'high' });
    assert.equal(adminOk.status, 200, JSON.stringify(adminOk.body));
  });

  it('lets the project lead edit scrum_master-restricted fields', async () => {
    assert.equal((await asAlice('PATCH', `/projects/${project.id}`, { leadId: bob.user.id })).status, 200);

    const asLead = await asBob('PATCH', `/issues/${issue.id}`, { priority: 'low' });
    assert.equal(asLead.status, 200, JSON.stringify(asLead.body));

    const stillBlocked = await asBob('PATCH', `/issues/${issue.id}`, { assigneeId: null });
    assert.equal(stillBlocked.status, 403, JSON.stringify(stillBlocked.body));
  });
});
