/*
 * Super-admin ops signals: Stripe/job counters and automation error list.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-ops-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let root;
let alice;

before(async () => {
  server = await startIsolatedServer({
    env: {
      SUPER_ADMIN_EMAIL: ADMIN.email,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_PRO: '',
      JOBS_ENABLED: 'false',
    },
  });
  call = apiClient(server.api);
  root = (await call('POST', '/auth/login', ADMIN)).body.token;

  const registered = await call('POST', '/auth/register', {
    name: 'Ops Alice',
    email: `alice-ops-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: `Ops Org ${stamp}`,
    organizationSlug: `ops-org-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  alice = { token: registered.body.token, organizationId: registered.body.organization.id };
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
});

after(async () => {
  await server?.stop();
});

describe('super-admin ops', () => {
  it('rejects non–super-admins', async () => {
    const response = await call('GET', '/super-admin/ops', null, alice.token, alice.organizationId);
    assert.equal(response.status, 403);
  });

  it('returns process health, stripe/job counters and automation errors', async () => {
    const response = await call('GET', '/super-admin/ops', null, root);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.process.jobsEnabled, false);
    assert.equal(response.body.process.sharedState, 'memory');
    assert.equal(response.body.stripe.configured, false);
    assert.equal(typeof response.body.summary.healthy, 'boolean');
    assert.equal(typeof response.body.summary.stripeWebhookFailures, 'number');
    assert.equal(typeof response.body.automations.rulesWithErrors, 'number');
    assert.ok(Array.isArray(response.body.automations.failing));
    assert.ok(Array.isArray(response.body.recent));
  });
});
