/*
 * Reports overview smoke against a real, isolated backend: register, approve, enable reports, then GET overview.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-reports-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let root;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const email = `owner-reports-${stamp}@example.test`;
  const registered = await call('POST', '/auth/register', {
    name: 'Reports Owner',
    email,
    password: PASSWORD,
    organizationName: 'Reports Org',
    organizationSlug: `reports-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id };
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { reports: true } }, root)).status,
    200,
  );
});

after(async () => {
  await server?.stop();
});

describe('reports overview', () => {
  it('returns a 30-day overview for an approved workspace with reports enabled', async () => {
    const response = await call('GET', '/reports/overview?days=30', null, owner.token, owner.organizationId);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.period?.days, 30);
    assert.ok(response.body.totals);
  });

  it('accepts a custom from/to range', async () => {
    const response = await call('GET', '/reports/overview?from=2026-01-01&to=2026-01-31', null, owner.token, owner.organizationId);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.period?.from, '2026-01-01');
    assert.equal(response.body.period?.to, '2026-01-31');
    assert.equal(response.body.period?.days, 31);
  });

  it('rejects an inverted from/to range', async () => {
    const response = await call('GET', '/reports/overview?from=2026-02-01&to=2026-01-01', null, owner.token, owner.organizationId);
    assert.equal(response.status, 400);
  });
});
