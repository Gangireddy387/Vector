/*
 * Automation plan gating and engine: Free blocks CRUD; unlocking allows rules;
 * issue.created actions run only while the automations feature is on.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-automations-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice;
let root;
let project;

async function signUp(label) {
  const email = `${label}-automations-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Automations Org`,
    organizationSlug: `${label}-automations-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

async function setFeatures(features) {
  const response = await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features }, root);
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

before(async () => {
  server = await startIsolatedServer({
    env: {
      SUPER_ADMIN_EMAIL: ADMIN.email,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_PRO: '',
    },
  });
  call = apiClient(server.api);
  alice = await signUp('alice');
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);

  const created = await asAlice('POST', '/projects', { name: 'Automation Project', key: 'AUT' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
});

after(async () => {
  await server?.stop();
});

describe('automation plan gating', () => {
  it('blocks automation routes on Free until the feature is unlocked', async () => {
    const list = await asAlice('GET', `/projects/${project.id}/automations`);
    assert.equal(list.status, 403);
    assert.equal(list.body.code ?? list.body.details?.code, 'plan_feature');

    const create = await asAlice('POST', `/projects/${project.id}/automations`, {
      name: 'Should be blocked',
      trigger: 'issue.created',
      conditions: [],
      actions: [{ type: 'set_priority', params: { priority: 'high' } }],
    });
    assert.equal(create.status, 403);
  });

  it('allows CRUD after automations is enabled', async () => {
    await setFeatures({ automations: true });

    const created = await asAlice('POST', `/projects/${project.id}/automations`, {
      name: 'Bump priority on create',
      trigger: 'issue.created',
      conditions: [],
      actions: [{ type: 'set_priority', params: { priority: 'high' } }],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.rule.name, 'Bump priority on create');
    assert.equal(created.body.rule.enabled, true);

    const listed = await asAlice('GET', `/projects/${project.id}/automations`);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(listed.body.rules.some((rule) => rule.id === created.body.rule.id));
  });
});

async function waitForPriority(issueId, expected, { timeoutMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const response = await asAlice('GET', `/issues/${issueId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    last = response.body.issue;
    if (last.priority === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(last?.priority, expected, JSON.stringify(last));
  return last;
}

describe('automation engine', () => {
  it('runs issue.created actions while the feature is on', async () => {
    await setFeatures({ automations: true });

    const made = await asAlice('POST', '/issues', {
      projectId: project.id,
      title: 'Automation should raise priority',
      priority: 'low',
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    // Automations run on setImmediate after the create response is built.
    await waitForPriority(made.body.issue.id, 'high');
  });

  it('skips rules when automations is turned off again', async () => {
    await setFeatures({ automations: false });

    const made = await asAlice('POST', '/issues', {
      projectId: project.id,
      title: 'Should stay low without automations',
      priority: 'low',
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const refreshed = await asAlice('GET', `/issues/${made.body.issue.id}`);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.issue.priority, 'low');

    await setFeatures({ automations: true });
  });

  it('accepts send_email rules even when emailAutomations is off (action no-ops)', async () => {
    await setFeatures({ automations: true, emailAutomations: false });

    const created = await asAlice('POST', `/projects/${project.id}/automations`, {
      name: 'Email noop',
      trigger: 'issue.created',
      conditions: [],
      actions: [
        {
          type: 'send_email',
          params: { recipients: ['reporter'], subject: 'Hello {{issue.key}}', message: 'Body' },
        },
      ],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const made = await asAlice('POST', '/issues', {
      projectId: project.id,
      title: 'Email automation should not fail the create path',
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    // Priority rule from earlier still fires; email action must not throw.
    await waitForPriority(made.body.issue.id, 'high');
  });
});
