/*
 * Personal calendar: list range validation, CRUD, UUID params, plan feature gate.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-cal-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let root;
let today;
let tomorrow;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'Calendar Owner',
    email: `owner-cal-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: 'Calendar Org',
    organizationSlug: `cal-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id };
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { calendar: true } }, root)).status,
    200,
  );
  const now = new Date();
  today = now.toISOString().slice(0, 10);
  // A week ahead avoids "past day" failures around UTC midnight in the owner's zone.
  tomorrow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
});

after(async () => {
  await server?.stop();
});

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);

describe('personal calendar', () => {
  it('rejects an inverted from/to range and returns events for a valid range', async () => {
    const inverted = await asOwner('GET', `/calendar/events?from=${tomorrow}&to=${today}`);
    assert.equal(inverted.status, 400);

    const list = await asOwner('GET', `/calendar/events?from=${today}&to=${tomorrow}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.events));
  });

  it('creates a timed event and rejects a bad event id', async () => {
    const created = await asOwner('POST', '/calendar/events', {
      title: 'Focus block',
      date: tomorrow,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      category: 'focus',
      location: null,
      projectId: null,
      description: null,
      repeat: null,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.events?.[0]?.title, 'Focus block');

    const badId = await asOwner('PATCH', '/calendar/events/not-a-uuid', { title: 'Nope' });
    assert.equal(badId.status, 400);

    const eventId = created.body.events[0].id;
    const removed = await asOwner('DELETE', `/calendar/events/${eventId}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.ok(removed.body.removedIds?.includes(eventId));
  });

  it('blocks calendar when the feature is turned off', async () => {
    assert.equal(
      (await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { calendar: false } }, root)).status,
      200,
    );
    const response = await asOwner('GET', `/calendar/events?from=${today}&to=${tomorrow}`);
    assert.equal(response.status, 403);
  });
});
