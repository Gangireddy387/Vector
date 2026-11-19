/*
 * Organization JSON backup for offboarding: admins only, includes projects/issues.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-backup-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let bob;
let project;
let issue;

async function signUp(label) {
  const email = `${label}-backup-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Backup Org`,
    organizationSlug: `${label}-backup-${stamp}`.toLowerCase(),
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
  assert.equal((await call('POST', `/super-admin/organizations/${bob.organizationId}/approve`, null, root)).status, 200);
  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email, role: 'member' })).status, 201);

  const created = await asAlice('POST', '/projects', { name: 'Backup Project', key: 'BKP' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  const made = await asAlice('POST', '/issues', {
    projectId: project.id,
    title: 'Export me',
    description: 'Should appear in the org backup',
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;

  assert.equal((await asAlice('POST', `/issues/${issue.id}/comments`, { body: 'Keep this comment' })).status, 201);
});

after(async () => {
  await server?.stop();
});

describe('workspace backup', () => {
  it('lets organization admins download a JSON backup', async () => {
    const response = await asAlice('GET', '/workspace/backup');
    assert.equal(response.status, 200, JSON.stringify(response.body)?.slice?.(0, 500) ?? response.body);
    assert.equal(response.body.format, 'vector-org-backup');
    assert.equal(response.body.version, 1);
    assert.equal(response.body.organization.id, alice.organizationId);
    assert.ok(response.body.stats.projects >= 1);
    assert.ok(response.body.stats.issues >= 1);
    const exported = response.body.projects.find((entry) => entry.id === project.id);
    assert.ok(exported);
    const exportedIssue = exported.issues.find((row) => row.id === issue.id);
    assert.ok(exportedIssue);
    assert.equal(exportedIssue.title, 'Export me');
    assert.ok(exportedIssue.comments.some((comment) => comment.body === 'Keep this comment'));
    assert.match(String(response.body.notes.attachments), /UPLOAD_DIR|upload/i);
  });

  it('keeps other organizations out of the backup', async () => {
    const bobBackup = await call('GET', '/workspace/backup', null, bob.token, bob.organizationId);
    assert.equal(bobBackup.status, 200, JSON.stringify(bobBackup.body)?.slice?.(0, 300));
    assert.equal(bobBackup.body.organization.id, bob.organizationId);
    assert.equal(
      bobBackup.body.projects.some((entry) => entry.id === project.id),
      false,
    );
  });

  it('requires organization admin on the workspace', async () => {
    const response = await call('GET', '/workspace/backup', null, bob.token, alice.organizationId);
    assert.equal(response.status, 403);
  });
});
