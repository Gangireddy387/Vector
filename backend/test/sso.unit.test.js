/*
 * Enterprise SSO helpers: domains, settings cleaning, and OIDC (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanSsoInput,
  emailDomain,
  normalizeDomains,
  publicOidc,
  publicSso,
} from '../src/modules/organizations/organization-sso.js';

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

  it('cleanSsoInput stores encrypted OIDC client secret and publicOidc hides it', () => {
    const org = { plan: { features: { sso: true } }, sso: null };
    const saved = cleanSsoInput(
      {
        enabled: true,
        enforce: true,
        provider: 'oidc',
        allowedDomains: ['acme.com'],
        oidc: {
          issuer: 'https://idp.example.com/',
          clientId: 'vector-app',
          clientSecret: 'super-secret',
          scopes: 'openid email profile',
        },
      },
      org,
    );
    assert.equal(saved.provider, 'oidc');
    assert.equal(saved.oidc.issuer, 'https://idp.example.com');
    assert.equal(saved.oidc.clientId, 'vector-app');
    assert.ok(saved.oidc.clientSecret);
    assert.notEqual(saved.oidc.clientSecret, 'super-secret');
    assert.match(saved.oidc.clientSecret, /^v1\./);

    const published = publicSso({ sso: saved }, { includeOidc: true });
    assert.equal(published.oidc.issuer, 'https://idp.example.com');
    assert.equal(published.oidc.clientSecretConfigured, true);
    assert.equal(published.oidc.clientSecret, undefined);
    assert.equal(publicOidc({ sso: saved }).clientSecretConfigured, true);

    const kept = cleanSsoInput(
      {
        enabled: true,
        enforce: true,
        provider: 'oidc',
        allowedDomains: ['acme.com'],
        oidc: {
          issuer: 'https://idp.example.com',
          clientId: 'vector-app',
          clientSecret: '',
          scopes: 'openid email profile',
        },
      },
      { plan: { features: { sso: true } }, sso: saved },
    );
    assert.equal(kept.oidc.clientSecret, saved.oidc.clientSecret);
  });

  it('cleanSsoInput rejects incomplete OIDC when enabled', () => {
    const org = { plan: { features: { sso: true } }, sso: null };
    assert.throws(
      () =>
        cleanSsoInput(
          {
            enabled: true,
            provider: 'oidc',
            allowedDomains: ['acme.com'],
            oidc: { issuer: 'https://idp.example.com', clientId: 'app' },
          },
          org,
        ),
      /client secret/i,
    );
  });
});
