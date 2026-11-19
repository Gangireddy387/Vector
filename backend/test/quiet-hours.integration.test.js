/*
 * Quiet hours preference: saved on the profile and used when deciding email/push.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-quiet-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;

before(async () => {
  server = await startIsolatedServer({
    env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password },
  });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'Quiet Alice',
    email: `alice-quiet-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: `Quiet Org ${stamp}`,
    organizationSlug: `quiet-org-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  alice = { token: registered.body.token, organizationId: registered.body.organization.id };
  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
});

after(async () => {
  await server?.stop();
});

describe('quiet hours preference', () => {
  it('saves and returns quiet hours on the profile', async () => {
    const updated = await call(
      'PATCH',
      '/auth/me',
      { preferences: { quietHours: { enabled: true, start: '21:30', end: '06:15' } }, timezone: 'UTC' },
      alice.token,
      alice.organizationId,
    );
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.user.preferences.quietHours.enabled, true);
    assert.equal(updated.body.user.preferences.quietHours.start, '21:30');
    assert.equal(updated.body.user.preferences.quietHours.end, '06:15');

    const me = await call('GET', '/auth/me', null, alice.token, alice.organizationId);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.preferences.quietHours.enabled, true);
  });

  it('rejects invalid quiet-hours times', async () => {
    const bad = await call(
      'PATCH',
      '/auth/me',
      { preferences: { quietHours: { enabled: true, start: '25:00', end: '07:00' } } },
      alice.token,
      alice.organizationId,
    );
    assert.equal(bad.status, 400);
  });
});
