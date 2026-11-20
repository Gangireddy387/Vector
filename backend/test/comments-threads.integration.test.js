/*
 * Issue comment threads (one level) and emoji reactions.
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
let root;

async function signUp(label) {
  const email = `${label}-cmt-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: 'correct-horse-battery',
    organizationName: `${label} Comments Org`,
    organizationSlug: `${label}-cmt-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer();
  call = apiClient(server.api);
  alice = await signUp('alice');
  const created = await asAlice('POST', '/projects', { name: 'Commentable', key: 'CMT' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
  const made = await asAlice('POST', '/issues', { projectId: project.id, title: 'Discuss me', type: 'task' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;
});

after(async () => {
  await server?.stop();
});

describe('comment threads and reactions', () => {
  it('creates a root comment and a one-level reply', async () => {
    const created = await asAlice('POST', `/issues/${issue.id}/comments`, { body: 'Root thought' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    root = created.body.comment;
    assert.equal(root.parentId ?? null, null);

    const reply = await asAlice('POST', `/issues/${issue.id}/comments`, {
      body: 'A reply',
      parentId: root.id,
    });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.comment.parentId, root.id);

    const nested = await asAlice('POST', `/issues/${issue.id}/comments`, {
      body: 'Too deep',
      parentId: reply.body.comment.id,
    });
    assert.equal(nested.status, 400, JSON.stringify(nested.body));

    const listed = await asAlice('GET', `/issues/${issue.id}/comments`);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const thread = listed.body.comments.find((row) => row.id === root.id);
    assert.ok(thread);
    assert.equal(thread.replies.length, 1);
    assert.equal(thread.replies[0].body, 'A reply');
  });

  it('toggles emoji reactions', async () => {
    const on = await asAlice('POST', `/comments/${root.id}/reactions`, { emoji: '👍' });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.equal(on.body.reactions.length, 1);
    assert.equal(on.body.reactions[0].emoji, '👍');
    assert.ok(on.body.reactions[0].userIds.includes(alice.user.id));

    const off = await asAlice('POST', `/comments/${root.id}/reactions`, { emoji: '👍' });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.reactions.length, 0);

    const bad = await asAlice('POST', `/comments/${root.id}/reactions`, { emoji: '🚀' });
    assert.equal(bad.status, 400);
  });

  it('deletes a root comment and its replies', async () => {
    const listed = await asAlice('GET', `/issues/${issue.id}/comments`);
    const thread = listed.body.comments.find((row) => row.id === root.id);
    assert.ok(thread?.replies?.length);

    const removed = await asAlice('DELETE', `/comments/${root.id}`);
    assert.equal(removed.status, 204);

    const after = await asAlice('GET', `/issues/${issue.id}/comments`);
    assert.equal(after.body.comments.find((row) => row.id === root.id), undefined);
  });
});
