/*
 * Standups smoke against a real, isolated backend: project with chat, POST an update, GET the day.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-standups-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let project;
let today;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const email = `owner-standups-${stamp}@example.test`;
  const registered = await call('POST', '/auth/register', {
    name: 'Standups Owner',
    email,
    password: PASSWORD,
    organizationName: 'Standups Org',
    organizationSlug: `standups-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id };
  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { chat: true } }, root)).status,
    200,
  );
  const created = await call('POST', '/projects', { name: 'Standup Project', key: 'STD' }, owner.token, owner.organizationId);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
  today = new Date().toISOString().slice(0, 10);
});

after(async () => {
  await server?.stop();
});

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);

describe('standups', () => {
  it('saves an update and returns it for the day', async () => {
    const saved = await asOwner('PUT', `/projects/${project.id}/standups/me`, {
      date: today,
      yesterday: 'Shipped the invite flow',
      today: 'Write standup tests',
      blockers: '',
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.update?.today, 'Write standup tests');

    const day = await asOwner('GET', `/projects/${project.id}/standups?date=${today}`);
    assert.equal(day.status, 200, JSON.stringify(day.body));
    assert.equal(day.body.date, today);
    assert.ok(day.body.members?.some((member) => member.update?.today === 'Write standup tests'));
  });

  it('rejects an empty update unless skipped', async () => {
    const empty = await asOwner('PUT', `/projects/${project.id}/standups/me`, {
      date: today,
      yesterday: '',
      today: '',
      blockers: '',
    });
    assert.equal(empty.status, 400);

    const skipped = await asOwner('PUT', `/projects/${project.id}/standups/me`, {
      date: today,
      yesterday: '',
      today: '',
      blockers: '',
      skipped: true,
    });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
    assert.equal(skipped.body.update, null);

    const day = await asOwner('GET', `/projects/${project.id}/standups?date=${today}`);
    assert.equal(day.status, 200, JSON.stringify(day.body));
    assert.ok(day.body.members?.every((member) => !member.update));
  });
});
