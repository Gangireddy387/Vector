/*
 * The sample project a new organization can start from, against a real, isolated backend: it comes with a running
 * sprint, labelled work in every column and due dates, uses a free project key, and still respects the plan's
 * project limit. Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);

let server;
let call;
let owner;

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);

before(async () => {
  server = await startIsolatedServer();
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'Olivia Owner',
    email: `owner-onboard-${stamp}@example.test`,
    password: 'correct-horse-battery',
    organizationName: 'Fresh Org',
    organizationSlug: `fresh-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id, userId: registered.body.user.id };
});

after(async () => {
  await server?.stop();
});

describe('sample project', () => {
  let sample;

  it('creates a project with a running sprint and example work', async () => {
    const created = await asOwner('POST', '/projects/sample');
    assert.equal(created.status, 201, JSON.stringify(created.body));
    sample = created.body.project;
    assert.equal(sample.key, 'DEMO');
    assert.match(sample.name, /^Sample/);
    assert.equal(sample.settings.isSample, true);

    const sprints = (await asOwner('GET', `/projects/${sample.id}/sprints`)).body.sprints;
    const active = sprints.find((sprint) => sprint.state === 'active');
    assert.ok(active, 'a sprint is running');
    assert.equal(active.goal, 'Launch the new marketing website');

    const { issues, total } = (await asOwner('GET', `/issues?projectId=${sample.id}&limit=50`)).body;
    assert.equal(total, 16, 'epic + stories/tasks + three sub-tasks');
    const categories = new Set(issues.map((issue) => issue.status.category));
    assert.deepEqual([...categories].sort(), ['done', 'in_progress', 'todo']);
    assert.ok(issues.some((issue) => issue.type === 'epic'), 'includes a launch epic');
    assert.ok(issues.some((issue) => issue.type === 'subtask'), 'includes sub-tasks under a parent');
    assert.ok(issues.some((issue) => issue.labels.length), 'tasks carry labels');
    assert.ok(issues.some((issue) => !issue.sprintId), 'some work waits in the backlog');

    const contact = issues.find((issue) => issue.title === 'Set up the contact form backend');
    assert.ok(contact, 'contact form task exists');
    const comments = (await asOwner('GET', `/issues/${contact.id}/comments`)).body.comments;
    assert.ok(comments?.length > 0, 'sample tasks include comments');

    const hero = issues.find((issue) => issue.title === 'Hero image loads slowly on phones');
    assert.ok(hero);
    const heroDetail = (await asOwner('GET', `/issues/${hero.id}`)).body.issue;
    assert.ok(
      (heroDetail.links ?? []).some((link) => link.type === 'blocks'),
      'hero bug blocks the launch announcement',
    );
  });

  it('puts some of the work on the person who created it, so Home is not empty', async () => {
    const dashboard = (await asOwner('GET', '/dashboard')).body;
    assert.ok(dashboard.stats.open > 0, JSON.stringify(dashboard.stats));
    assert.ok(dashboard.stats.overdue > 0, 'one task is overdue');
    assert.ok(dashboard.activeSprints.some((sprint) => sprint.projectId === sample.id));
  });

  it('uses the next free key and stops at the plan’s project limit', async () => {
    const second = await asOwner('POST', '/projects/sample');
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.project.key, 'DEMO2');

    const third = await asOwner('POST', '/projects/sample');
    assert.equal(third.status, 403, JSON.stringify(third.body));
    assert.equal(third.body.details?.code, 'plan_limit');
  });

  it('is removed like any project', async () => {
    assert.equal((await asOwner('DELETE', `/projects/${sample.id}`)).status, 204);
    assert.equal((await asOwner('GET', `/projects/${sample.id}`)).status, 404);
  });
});
