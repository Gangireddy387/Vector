/*
 * Billing API without a live Stripe account: status flags, 503 when Checkout is off,
 * portal/seats gates, and webhook signature rejection.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-billing-${stamp}@example.test`, password: 'super-admin-password-123' };

/** Clear Stripe so tests do not inherit keys from backend/.env via process.env. */
const NO_STRIPE = {
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  STRIPE_PRICE_PRO: '',
  STRIPE_PRICE_ENTERPRISE: '',
};

let serverOff;
let callOff;
let aliceOff;
let orgOff;

let serverOn;
let callOn;
let aliceOn;
let orgOn;
let rootOn;

async function signUp(call, label) {
  const email = `${label}-billing-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Billing Org`,
    organizationSlug: `${label}-billing-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

before(async () => {
  serverOff = await startIsolatedServer({
    env: { ...NO_STRIPE, SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password },
  });
  callOff = apiClient(serverOff.api);
  aliceOff = await signUp(callOff, 'alice-off');
  orgOff = aliceOff.organizationId;
  const rootOff = (await callOff('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await callOff('POST', `/super-admin/organizations/${orgOff}/approve`, null, rootOff)).status, 200);

  serverOn = await startIsolatedServer({
    env: {
      SUPER_ADMIN_EMAIL: `root-billing-on-${stamp}@example.test`,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
      STRIPE_SECRET_KEY: 'sk_test_vector_integration_not_real',
      STRIPE_WEBHOOK_SECRET: 'whsec_vector_integration_not_real',
      STRIPE_PRICE_PRO: 'price_vector_integration_not_real',
      STRIPE_PRICE_ENTERPRISE: 'price_vector_enterprise_not_real',
      STRIPE_TRIAL_DAYS: '7',
      STRIPE_TRIAL_DAYS_ENTERPRISE: '14',
      STRIPE_MIN_SEATS: '1',
      STRIPE_MAX_SEATS: '50',
    },
  });
  callOn = apiClient(serverOn.api);
  aliceOn = await signUp(callOn, 'alice-on');
  orgOn = aliceOn.organizationId;
  rootOn = (await callOn('POST', '/auth/login', { email: `root-billing-on-${stamp}@example.test`, password: ADMIN.password })).body
    .token;
  assert.equal((await callOn('POST', `/super-admin/organizations/${orgOn}/approve`, null, rootOn)).status, 200);
});

after(async () => {
  await serverOff?.stop();
  await serverOn?.stop();
});

const asAliceOff = (method, url, body) => callOff(method, url, body, aliceOff.token, orgOff);
const asAliceOn = (method, url, body) => callOn(method, url, body, aliceOn.token, orgOn);

describe('billing without Stripe configured', () => {
  it('reports checkout disabled and rejects checkout / seats / portal', async () => {
    const status = await asAliceOff('GET', '/billing/status');
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.checkoutEnabled, false);
    assert.equal(status.body.proCheckoutEnabled, false);
    assert.equal(status.body.enterpriseCheckoutEnabled, false);
    assert.equal(status.body.portalEnabled, false);
    assert.equal(status.body.hasSubscription, false);
    assert.equal(status.body.trialDays, 0);

    const checkout = await asAliceOff('POST', '/billing/checkout', { seats: 3 });
    assert.equal(checkout.status, 503);
    assert.equal(checkout.body.code ?? checkout.body.details?.code, 'billing_not_configured');

    const seats = await asAliceOff('POST', '/billing/seats', { seats: 3 });
    assert.equal(seats.status, 503);

    const portal = await asAliceOff('POST', '/billing/portal');
    assert.equal(portal.status, 503);
  });

  it('rejects Stripe webhooks without a signature', async () => {
    const response = await fetch(`${serverOff.api}/billing/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 400);
  });
});

describe('billing with Stripe keys present (no live customer)', () => {
  it('enables checkout flags but blocks portal until a customer exists', async () => {
    const status = await asAliceOn('GET', '/billing/status');
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.checkoutEnabled, true);
    assert.equal(status.body.proCheckoutEnabled, true);
    assert.equal(status.body.enterpriseCheckoutEnabled, true);
    assert.equal(status.body.portalEnabled, false);
    assert.equal(status.body.trialDays, 7);
    assert.equal(status.body.enterpriseTrialDays, 14);
    assert.equal(status.body.maxSeats, 50);

    const portal = await asAliceOn('POST', '/billing/portal');
    assert.equal(portal.status, 400);
    assert.match(String(portal.body.message ?? ''), /checkout first|billing account/i);

    const seats = await asAliceOn('POST', '/billing/seats', { seats: 2 });
    assert.equal(seats.status, 400);
    assert.match(String(seats.body.message ?? ''), /subscription|checkout/i);
  });
});
