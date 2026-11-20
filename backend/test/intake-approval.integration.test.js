/*
 * Intake approval gate: public submit → pending queue → admin approve/reject.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-intake-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let root;
let project;

async function signUp(label) {
  const email = `${label}-intake-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Intake Org`,
    organizationSlug: `${label}-intake-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer({
    env: {
      SUPER_ADMIN_EMAIL: ADMIN.email,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
    },
  });
  call = apiClient(server.api);
  alice = await signUp('alice');
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { intakeForms: true } }, root))
      .status,
    200,
  );

  const created = await asAlice('POST', '/projects', { name: 'Intake Project', key: 'INQ' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
});

after(async () => {
  await server?.stop();
});

describe('intake approval API', () => {
  it('holds public submissions until an admin approves', async () => {
    const enabled = await asAlice('POST', `/projects/${project.id}/intake-form`, {
      enabled: true,
      title: 'Ask for help',
      settings: { requireApproval: true, askDescription: true },
    });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    assert.equal(enabled.body.intake.settings.requireApproval, true);
    assert.ok(enabled.body.intake.settings.reviewStatusId);
    const token = enabled.body.intake.token;
    assert.ok(token);

    const submitted = await call('POST', `/intake-forms/${token}/submissions`, {
      name: 'Pat Guest',
      email: 'pat@example.test',
      title: 'Need a new report',
      description: 'Weekly export please',
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.pendingReview, true);
    assert.ok(submitted.body.key);

    const queue = await asAlice('GET', `/projects/${project.id}/intake-submissions?state=pending`);
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.submissions.length, 1);
    assert.equal(queue.body.submissions[0].submitterName, 'Pat Guest');
    assert.equal(queue.body.submissions[0].issue.key, submitted.body.key);
    const submissionId = queue.body.submissions[0].id;

    const approved = await asAlice('POST', `/projects/${project.id}/intake-submissions/${submissionId}/approve`, {
      note: 'Looks good',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.submission.state, 'approved');

    const pendingAfter = await asAlice('GET', `/projects/${project.id}/intake-submissions?state=pending`);
    assert.equal(pendingAfter.status, 200);
    assert.equal(pendingAfter.body.submissions.length, 0);

    const onIssue = await asAlice('GET', `/issues/${submitted.body.key}/intake-submission`);
    assert.equal(onIssue.status, 200, JSON.stringify(onIssue.body));
    assert.equal(onIssue.body.submission.state, 'approved');
  });
});
