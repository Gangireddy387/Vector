/*
 * Public shares: password unlock, expiry, and guest comments on issue links.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-share-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let root;
let project;
let issue;

async function signUp(label) {
  const email = `${label}-share-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Share Org`,
    organizationSlug: `${label}-share-${stamp}`.toLowerCase(),
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
    (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { publicShare: true } }, root)).status,
    200,
  );

  const created = await asAlice('POST', '/projects', { name: 'Share Project', key: 'SHR' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  const made = await asAlice('POST', '/issues', {
    projectId: project.id,
    title: 'Shared task for guests',
    description: 'Visible on the public link',
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;
});

after(async () => {
  await server?.stop();
});

describe('public share guest collab', () => {
  it('locks passworded issue shares until unlock, then accepts guest comments', async () => {
    const enabled = await asAlice('POST', `/issues/${issue.id}/share-link`, {
      enabled: true,
      password: 'share-secret',
      guestCommentsEnabled: true,
    });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    assert.equal(enabled.body.share.enabled, true);
    assert.equal(enabled.body.share.hasPassword, true);
    assert.equal(enabled.body.share.guestCommentsEnabled, true);
    const token = enabled.body.share.token;
    assert.ok(token);

    const locked = await call('GET', `/share-links/${token}`);
    assert.equal(locked.status, 200, JSON.stringify(locked.body));
    assert.equal(locked.body.locked, true);
    assert.equal(locked.body.requiresPassword, true);
    assert.equal(locked.body.issue, undefined);

    const wrong = await call('POST', `/share-links/${token}/unlock`, { password: 'nope' });
    assert.equal(wrong.status, 401);

    const unlocked = await call('POST', `/share-links/${token}/unlock`, { password: 'share-secret' });
    assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));
    assert.equal(unlocked.body.locked, false);
    assert.equal(unlocked.body.issue?.title, 'Shared task for guests');
    assert.equal(unlocked.body.guestCommentsEnabled, true);
    assert.ok(unlocked.body.accessToken);

    const commented = await fetch(`${server.api}/share-links/${token}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unlocked.body.accessToken}`,
      },
      body: JSON.stringify({ name: 'Pat Guest', body: 'Looks good from outside' }),
    });
    const commentBody = await commented.json();
    assert.equal(commented.status, 201, JSON.stringify(commentBody));
    assert.equal(commentBody.authorName, 'Pat Guest');
    assert.equal(commentBody.isGuest, true);

    const listed = await asAlice('GET', `/issues/${issue.id}/comments`);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const guest = (listed.body.comments ?? listed.body).find(
      (row) => row.guestAuthorName === 'Pat Guest' || (!row.authorId && row.body.includes('Looks good')),
    );
    assert.ok(guest, JSON.stringify(listed.body));
    assert.equal(guest.guestAuthorName, 'Pat Guest');
  });

  it('rejects expired share links', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const enabled = await asAlice('POST', `/issues/${issue.id}/share-link`, {
      enabled: true,
      reset: true,
      expiresAt: past,
      guestCommentsEnabled: false,
    });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    const token = enabled.body.share.token;
    const dead = await call('GET', `/share-links/${token}`);
    assert.equal(dead.status, 404);
  });
});
