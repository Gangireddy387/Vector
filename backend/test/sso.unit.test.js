/*
 * Enterprise SSO helpers: domains and settings cleaning (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanSsoInput, emailDomain, normalizeDomains, publicSso } from '../src/modules/organizations/organization-sso.js';

describe('organization-sso helpers', () => {
  it('normalizes email domains', () => {
    assert.equal(emailDomain('Ada@Acme.COM'), 'acme.com');
    assert.deepEqual(normalizeDomains(['@Acme.com', 'acme.com', 'bad', 'x.y']), ['acme.com', 'x.y']);
  });

  it('publicSso defaults and enforce only when enabled', () => {
    assert.equal(publicSso(null).enabled, false);
    assert.equal(publicSso({ sso: { enabled: false, enforce: true } }).enforce, false);
    assert.equal(publicSso({ sso: { enabled: true, enforce: true, provider: 'google' } }).enforce, true);
  });

  it('cleanSsoInput requires the plan feature and domains when enforcing', () => {
    const noFeature = { plan: { features: { sso: false } }, sso: null };
    assert.throws(() => cleanSsoInput({ enabled: true }, noFeature), /not included/);

    const org = { plan: { features: { sso: true } }, sso: null };
    assert.throws(() => cleanSsoInput({ enabled: true, enforce: true, allowedDomains: [] }, org), /email domain/);

    const saved = cleanSsoInput(
      {
        enabled: true,
        enforce: true,
        provider: 'microsoft',
        allowedDomains: ['acme.com'],
        microsoftTenant: '11111111-2222-3333-4444-555555555555',
      },
      org,
    );
    assert.equal(saved.enabled, true);
    assert.equal(saved.enforce, true);
    assert.equal(saved.microsoftTenant, '11111111-2222-3333-4444-555555555555');
  });
});
