/*
 * Global search depth (title, description, comments, labels) and saved filter CRUD
 * (unique names, defaults, criteria validation) against a throwaway backend.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);

let server;
let call;
let alice;
let project;
let issue;

async function signUp(label) {
  const email = `${label}-search-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: 'correct-horse-battery',
    organizationName: `${label} Search Org`,
    organizationSlug: `${label}-search-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer();
  call = apiClient(server.api);
  alice = await signUp('alice');

  const created = await asAlice('POST', '/projects', { name: 'Searchable', key: 'SRC' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  const label = await asAlice('POST', `/projects/${project.id}/labels`, { name: 'needle-label', color: '#22c55e' });
  assert.equal(label.status, 201, JSON.stringify(label.body));

  const made = await asAlice('POST', '/issues', {
    projectId: project.id,
    title: 'Ordinary title',
    description: 'unique-description-token lives here',
    type: 'task',
    labelIds: [label.body.label.id],
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;

  const comment = await asAlice('POST', `/issues/${issue.id}/comments`, { body: 'unique-comment-token in the thread' });
  assert.equal(comment.status, 201, JSON.stringify(comment.body));
});

after(async () => {
  await server?.stop();
});

describe('global search', () => {
  it('finds tasks by description, comment and label, and reports match field', async () => {
    const byDescription = await asAlice('GET', `/search?q=${encodeURIComponent('unique-description-token')}`);
    assert.equal(byDescription.status, 200, JSON.stringify(byDescription.body));
    assert.ok(byDescription.body.issues.some((row) => row.id === issue.id && row.matchedOn === 'description'));

    const byComment = await asAlice('GET', `/search?q=${encodeURIComponent('unique-comment-token')}`);
    assert.equal(byComment.status, 200, JSON.stringify(byComment.body));
    assert.ok(byComment.body.issues.some((row) => row.id === issue.id && row.matchedOn === 'comment'));

    const byLabel = await asAlice('GET', `/search?q=${encodeURIComponent('needle-label')}`);
    assert.equal(byLabel.status, 200, JSON.stringify(byLabel.body));
    assert.ok(byLabel.body.issues.some((row) => row.id === issue.id && row.matchedOn === 'label'));
  });

  it('scopes results and finds projects by key', async () => {
    const projectsOnly = await asAlice('GET', `/search?q=SRC&scope=projects`);
    assert.equal(projectsOnly.status, 200, JSON.stringify(projectsOnly.body));
    assert.equal(projectsOnly.body.issues.length, 0);
    assert.ok(projectsOnly.body.projects.some((row) => row.id === project.id));
    assert.equal(projectsOnly.body.people.length, 0);
  });

  it('rejects empty queries', async () => {
    assert.equal((await asAlice('GET', '/search?q=')).status, 400);
  });

  it('ranks title matches above description-only matches', async () => {
    const titleHit = await asAlice('POST', '/issues', {
      projectId: project.id,
      title: 'ranktoken in the title',
      description: 'unrelated body',
      type: 'task',
    });
    assert.equal(titleHit.status, 201, JSON.stringify(titleHit.body));

    const bodyHit = await asAlice('POST', '/issues', {
      projectId: project.id,
      title: 'Something else entirely',
      description: 'ranktoken only appears in the description',
      type: 'task',
    });
    assert.equal(bodyHit.status, 201, JSON.stringify(bodyHit.body));

    const found = await asAlice('GET', `/search?q=${encodeURIComponent('ranktoken')}&scope=issues`);
    assert.equal(found.status, 200, JSON.stringify(found.body));
    const ids = found.body.issues.map((row) => row.id);
    const titleIndex = ids.indexOf(titleHit.body.issue.id);
    const bodyIndex = ids.indexOf(bodyHit.body.issue.id);
    assert.ok(titleIndex !== -1 && bodyIndex !== -1, 'both issues should match');
    assert.ok(titleIndex < bodyIndex, 'title hit should rank above description-only hit');
    assert.equal(found.body.issues[titleIndex].matchedOn, 'title');
    assert.equal(found.body.issues[bodyIndex].matchedOn, 'description');
  });
});

describe('saved filters', () => {
  let filterId;

  it('creates, lists, updates, defaults and deletes a view', async () => {
    const created = await asAlice('POST', '/saved-filters', {
      name: 'My bugs',
      projectId: project.id,
      criteria: { type: 'bug', assigneeId: 'me' },
      isDefault: true,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    filterId = created.body.filter.id;
    assert.equal(created.body.filter.isDefault, true);

    const listed = await asAlice('GET', `/saved-filters?projectId=${project.id}`);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(listed.body.filters.some((row) => row.id === filterId && row.isDefault));

    const renamed = await asAlice('PATCH', `/saved-filters/${filterId}`, { name: 'Open bugs' });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.filter.name, 'Open bugs');

    const second = await asAlice('POST', '/saved-filters', {
      name: 'Overdue',
      projectId: project.id,
      criteria: { overdue: 'true' },
      isDefault: true,
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const afterDefault = await asAlice('GET', `/saved-filters?projectId=${project.id}`);
    const defaults = afterDefault.body.filters.filter((row) => row.isDefault);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0].id, second.body.filter.id);

    assert.equal((await asAlice('DELETE', `/saved-filters/${filterId}`)).status, 204);
    assert.equal((await asAlice('DELETE', `/saved-filters/${second.body.filter.id}`)).status, 204);
  });

  it('rejects empty criteria, unknown keys and duplicate names', async () => {
    assert.equal((await asAlice('POST', '/saved-filters', { name: 'Empty', criteria: {} })).status, 400);
    assert.equal(
      (await asAlice('POST', '/saved-filters', { name: 'Bad', criteria: { type: 'bug', hack: '1' } })).status,
      400,
    );

    const first = await asAlice('POST', '/saved-filters', {
      name: 'Dup',
      criteria: { type: 'task' },
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(
      (await asAlice('POST', '/saved-filters', { name: 'Dup', criteria: { priority: 'high' } })).status,
      409,
    );
    assert.equal((await asAlice('DELETE', `/saved-filters/${first.body.filter.id}`)).status, 204);
  });
});
