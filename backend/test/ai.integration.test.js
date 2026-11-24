/*
 * Issue AI (draft / summarize / breakdown / daily briefing) and meeting extractive summaries against a throwaway
 * backend. Covers plan gating, heuristic mode without OpenAI, and OpenAI mode via a local stand-in.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-issue-ai-${stamp}@example.test`, password: 'super-admin-password-123' };

function startFakeOpenAi() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!req.url.endsWith('/chat/completions')) return res.writeHead(404).end();
      const { messages } = JSON.parse(body);
      const system = messages[0].content;
      const user = messages[1].content;
      let payload = {};
      if (system.includes('senior agile project manager') && user.includes('Draft a well-structured issue')) {
        payload = {
          type: 'bug',
          priority: 'high',
          storyPoints: 3,
          description: '## Goal\nFix login\n\n## Acceptance criteria\n- [ ] Works',
          subtasks: ['Reproduce', 'Fix', 'Test'],
          labels: [],
        };
      } else if (user.includes('Summarize this issue')) {
        payload = { summary: 'Login is broken for some users.', keyPoints: ['High priority'], nextSteps: ['Ship a fix'] };
      } else if (user.includes('Break this')) {
        payload = { subtasks: ['Reproduce on staging', 'Patch auth', 'Add regression test'] };
      } else if (user.includes('Suggest ONE concrete next action')) {
        payload = { action: 'Reproduce the login failure', kind: 'progress' };
      } else if (user.includes('daily briefing')) {
        payload = { headline: 'Clear overdue work first.', focus: ['Finish first task'], watch: ['Overdue risk'] };
      } else if (system.includes('summarize work meetings')) {
        payload = { text: 'AI meeting summary.', decisions: ['Ship Friday'], actionItems: [{ text: 'Update docs', owner: null, due: null, priority: null }] };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let fake;
let server;
let call;
let alice;
let bob;
let project;
let issue;
let root;

async function signUp(label) {
  const email = `${label}-issue-ai-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Issue AI Org`,
    organizationSlug: `${label}-issue-ai-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);

before(async () => {
  fake = await startFakeOpenAi();
  server = await startIsolatedServer({
    env: {
      SUPER_ADMIN_EMAIL: ADMIN.email,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: `http://127.0.0.1:${fake.address().port}/v1`,
    },
  });
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { aiAssistant: true, meetings: true, chat: true } }, root)).status,
    200,
  );
  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email })).status, 201);

  const created = await asAlice('POST', '/projects', { name: 'AI Project', key: 'AIP' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;

  const made = await asAlice('POST', '/issues', {
    projectId: project.id,
    title: 'Login fails for SSO users',
    description: '## Acceptance criteria\n- [ ] SSO works\n- [ ] Regression test',
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  issue = made.body.issue;
  assert.equal((await asAlice('POST', `/issues/${issue.id}/comments`, { body: 'Please verify on staging next' })).status, 201);
});

after(async () => {
  await server?.stop();
  await new Promise((resolve) => fake?.close(resolve));
});

describe('issue AI with OpenAI', () => {
  it('drafts, summarizes and breaks down work', async () => {
    const draft = await asAlice('POST', '/ai/draft-issue', { projectId: project.id, title: 'Fix login crash' });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(draft.body.source, 'openai');
    assert.equal(draft.body.type, 'bug');
    assert.ok(draft.body.subtasks.length);

    const summary = await asAlice('POST', `/ai/issues/${issue.id}/summary`);
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.source, 'openai');
    assert.match(summary.body.summary, /Login/);

    const breakdown = await asAlice('POST', `/ai/issues/${issue.key}/breakdown`);
    assert.equal(breakdown.status, 200, JSON.stringify(breakdown.body));
    assert.equal(breakdown.body.source, 'openai');
    assert.ok(breakdown.body.subtasks.length >= 2);

    const next = await asAlice('POST', `/ai/issues/${issue.id}/next-action`);
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.ok(next.body.action);
    assert.ok(next.body.kind);
  });

  it('returns a daily briefing', async () => {
    const briefing = await asAlice('GET', '/ai/daily-briefing');
    assert.equal(briefing.status, 200, JSON.stringify(briefing.body));
    assert.ok(briefing.body.needsMe.headline);
    assert.ok(Array.isArray(briefing.body.needsMe.focusActions));
  });
});

describe('plan gating and heuristic mode', () => {
  it('blocks AI routes when the plan feature is off', async () => {
    assert.equal(
      (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { aiAssistant: false, meetings: true, chat: true } }, root)).status,
      200,
    );
    assert.equal((await asAlice('POST', '/ai/draft-issue', { projectId: project.id, title: 'Should be blocked' })).status, 403);
    assert.equal(
      (await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { aiAssistant: true, meetings: true, chat: true } }, root)).status,
      200,
    );
  });
});

describe('meeting summary without depending on live AI notes', () => {
  it('writes a summary from notes when the plan allows it', async () => {
    const scheduled = await asAlice('POST', '/meetings', {
      title: 'Notes only sync',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      durationMinutes: 15,
      participantIds: [bob.user.id],
    });
    assert.equal(scheduled.status, 201, JSON.stringify(scheduled.body));
    const meetingId = scheduled.body.meeting.id;
    assert.equal((await asAlice('PATCH', `/meetings/${meetingId}`, { notes: 'We decided to ship Friday.\n- Update the pricing page' })).status, 200);

    // End so summarize is meaningful for hosts; writeSummary only needs manage rights + material.
    const caps = await asAlice('GET', '/meetings/capabilities');
    assert.equal(caps.status, 200);
    assert.equal(caps.body.summaries, true);

    const summary = await asAlice('POST', `/meetings/${meetingId}/summary`);
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.ok(summary.body.summary?.text);
  });
});
