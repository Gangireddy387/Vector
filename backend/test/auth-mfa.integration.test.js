/*
 * TOTP MFA: setup → confirm → login step-up → recovery → disable.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as OTPAuth from 'otpauth';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-mfa-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let secret;
let recoveryCodes;

const totpNow = (base32) =>
  new OTPAuth.TOTP({
    issuer: 'Vector',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32),
  }).generate();

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'MFA Owner',
    email: `owner-mfa-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: 'MFA Org',
    organizationSlug: `mfa-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id, email: registered.body.user.email };
  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
});

after(async () => {
  await server?.stop();
});

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);

describe('auth MFA', () => {
  it('sets up and confirms TOTP, returning recovery codes once', async () => {
    const setup = await asOwner('POST', '/auth/me/mfa/setup');
    assert.equal(setup.status, 200, JSON.stringify(setup.body));
    assert.ok(setup.body.secret);
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\//);
    secret = setup.body.secret;

    const meBefore = await asOwner('GET', '/auth/me');
    assert.equal(meBefore.body.user.mfaEnabled, false);
    assert.equal(meBefore.body.user.mfaSecret, undefined);

    const wrong = await asOwner('POST', '/auth/me/mfa/confirm', { code: '000000' });
    assert.equal(wrong.status, 400);

    const confirmed = await asOwner('POST', '/auth/me/mfa/confirm', { code: totpNow(secret) });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.user.mfaEnabled, true);
    assert.equal(confirmed.body.recoveryCodes?.length, 8);
    recoveryCodes = confirmed.body.recoveryCodes;
  });

  it('requires MFA after password and accepts a TOTP code', async () => {
    const login = await call('POST', '/auth/login', { email: owner.email, password: PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.mfaRequired, true);
    assert.ok(login.body.mfaToken);
    assert.equal(login.body.token, undefined);

    const denied = await call('GET', '/auth/me', null, login.body.mfaToken);
    assert.equal(denied.status, 401);

    const bad = await call('POST', '/auth/login/mfa', { mfaToken: login.body.mfaToken, code: '000000' });
    assert.equal(bad.status, 401);

    const ok = await call('POST', '/auth/login/mfa', { mfaToken: login.body.mfaToken, code: totpNow(secret) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.token);
    owner.token = ok.body.token;
  });

  it('accepts a one-time recovery code and rejects reuse', async () => {
    const login = await call('POST', '/auth/login', { email: owner.email, password: PASSWORD });
    assert.equal(login.body.mfaRequired, true);
    const code = recoveryCodes[0];
    const ok = await call('POST', '/auth/login/mfa', { mfaToken: login.body.mfaToken, recoveryCode: code });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    owner.token = ok.body.token;

    const againLogin = await call('POST', '/auth/login', { email: owner.email, password: PASSWORD });
    const reuse = await call('POST', '/auth/login/mfa', { mfaToken: againLogin.body.mfaToken, recoveryCode: code });
    assert.equal(reuse.status, 401);
  });

  it('disables MFA with password and authenticator code', async () => {
    const disabled = await asOwner('POST', '/auth/me/mfa/disable', { password: PASSWORD, code: totpNow(secret) });
    assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
    assert.equal(disabled.body.user.mfaEnabled, false);

    const login = await call('POST', '/auth/login', { email: owner.email, password: PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(login.body.token);
    assert.equal(login.body.mfaRequired, undefined);
  });
});
