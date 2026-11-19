/*
 * Enterprise SSO: plan feature gate, workspace settings, password block, public org hints.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-sso-${stamp}@example.test`, password: 'super-admin-password-123' };
const DOMAIN = `sso-${stamp}.example.test`;
const SLUG = `sso-org-${stamp}`;

let server;
let call;
let alice;
let root;

before(async () => {
  server = await startIsolatedServer({
    env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password },
  });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'SSO Alice',
    email: `alice@${DOMAIN}`,
    password: PASSWORD,
    organizationName: `SSO Org ${stamp}`,
    organizationSlug: SLUG,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  alice = { token: registered.body.token, organizationId: registered.body.organization.id };
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
});

after(async () => {
  await server?.stop();
});

describe('enterprise SSO', () => {
  it('rejects SSO settings without the plan feature', async () => {
    const denied = await call(
      'PATCH',
      '/workspace',
      { sso: { enabled: true, enforce: true, provider: 'microsoft', allowedDomains: [DOMAIN] } },
      alice.token,
      alice.organizationId,
    );
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
  });

  it('saves SSO after the feature is unlocked and exposes public hints', async () => {
    const unlocked = await call(
      'PUT',
      `/super-admin/organizations/${alice.organizationId}/features`,
      { features: { sso: true } },
      root,
    );
    assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));

    const tenant = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const saved = await call(
      'PATCH',
      '/workspace',
      {
        sso: {
          enabled: true,
          enforce: true,
          provider: 'microsoft',
          allowedDomains: [DOMAIN],
          microsoftTenant: tenant,
        },
      },
      alice.token,
      alice.organizationId,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.settings.sso.available, true);
    assert.equal(saved.body.settings.sso.enabled, true);
    assert.equal(saved.body.settings.sso.enforce, true);
    assert.equal(saved.body.settings.sso.provider, 'microsoft');
    assert.deepEqual(saved.body.settings.sso.allowedDomains, [DOMAIN]);
    assert.equal(saved.body.settings.sso.microsoftTenant, tenant);

    const publicOrg = await call('GET', `/organizations/by-slug/${SLUG}`);
    assert.equal(publicOrg.status, 200);
    assert.equal(publicOrg.body.organization.sso.enabled, true);
    assert.equal(publicOrg.body.organization.sso.enforce, true);
    assert.equal(publicOrg.body.organization.sso.microsoftTenant, tenant);
  });

  it('blocks password login when SSO is enforced for the email domain', async () => {
    const blocked = await call('POST', '/auth/login', { email: `alice@${DOMAIN}`, password: PASSWORD });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.match(blocked.body.message, /Microsoft sign-in/i);
    assert.equal(blocked.body.details?.code, 'sso_required');
    assert.equal(blocked.body.details?.provider, 'microsoft');
  });

  it('rejects enforce without domains', async () => {
    const bad = await call(
      'PATCH',
      '/workspace',
      { sso: { enabled: true, enforce: true, provider: 'google', allowedDomains: [] } },
      alice.token,
      alice.organizationId,
    );
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
  });
});
