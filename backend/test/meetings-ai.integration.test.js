/*
 * Meeting AI end to end against a real, isolated backend, with a stand-in for the OpenAI API (so the test is
 * repeatable and free): AI notes from speech, translated captions, the in-call assistant, Q&A help, the summary with
 * chapters and owners, the recap, action items turned into tasks, agendas and meaning-based search.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-ai-${stamp}@example.test`, password: 'super-admin-password-123' };
const SPOKEN = 'We ship the pricing page on Friday';

// --- A stand-in for the OpenAI API ------------------------------------------------------------------------------------

/** Each word lands in one of 32 buckets: texts sharing words point the same way. */
function embed(text) {
  const vector = new Array(32).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % 32;
    vector[hash] += 1;
  }
  return vector;
}

function chat(system, user) {
  if (system.includes('summarize work meetings')) {
    return {
      text: 'The team planned the launch of the pricing page.',
      decisions: ['Ship on Friday'],
      actionItems: [
        { text: 'Update the pricing page', owner: 'member Person', due: '2026-11-06', priority: 'high' },
        { text: 'Write the announcement', owner: null, due: null, priority: null },
      ],
    };
  }
  if (system.includes('into chapters')) return { chapters: [{ line: 1, title: 'Launch plan' }] };
  if (system.includes('translate live meeting captions')) {
    const codes = [...user.matchAll(/\b([a-z]{2}) \(/g)].map((match) => match[1]);
    return { translations: Object.fromEntries(codes.map((code) => [code, `[${code}] ${user.split('Line: ')[1]}`])) };
  }
  if (system.includes('meeting assistant inside a live video call')) return { answer: user.includes('pricing page') ? 'You missed the plan to ship the pricing page on Friday.' : 'Nothing yet.' };
  if (system.includes('compare audience questions')) {
    const existing = user.split('Existing questions:\n')[1]?.split('\n')[0];
    return { match: /ship/i.test(user.split('\n')[0]) && existing ? existing.split(':')[0] : null };
  }
  if (system.includes('group audience questions')) return { groups: [user.split('\n').filter((line) => /ship/i.test(line)).map((line) => line.split(':')[0])] };
  if (system.includes('answer an audience question')) return { answer: 'We ship on Friday.' };
  if (system.includes('prepare agendas')) return { agenda: `1. Launch review (10 min)\n${user.includes('Overdue') ? '- Overdue work' : ''}` };
  return {};
}

function startFakeOpenAi() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const send = (value) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      if (req.url.endsWith('/audio/transcriptions')) return send({ text: SPOKEN });
      if (req.url.endsWith('/embeddings')) {
        const input = JSON.parse(body).input;
        return send({ data: input.map((text, index) => ({ index, embedding: embed(text) })) });
      }
      if (req.url.endsWith('/chat/completions')) {
        const { messages } = JSON.parse(body);
        return send({ choices: [{ message: { content: JSON.stringify(chat(messages[0].content, messages[1].content)) } }] });
      }
      res.writeHead(404).end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --- Helpers ----------------------------------------------------------------------------------------------------------

let fake;
let server;
let call;
let alice;
let bob;
let project;
let meeting;
let aliceSocket;
let bobSocket;

async function signUp(label) {
  const email = `${label}-ai-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', { name: `${label} Person`, email, password: PASSWORD, organizationName: `${label} AI Org`, organizationSlug: `${label}-ai-${stamp}`.toLowerCase() });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
const ask = (socket, event, payload = {}) =>
  new Promise((resolve) => socket.timeout(20_000).emit(event, payload, (error, response) => resolve(error ? { ok: false, error: 'timeout' } : response)));
const next = (socket, event, filter = () => true, ms = 10_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`no ${event} within ${ms} ms`));
    }, ms);
    function handler(payload) {
      if (!filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);
const asBob = (method, url, body) => call(method, url, body, bob.token, alice.organizationId);
const speech = () => ({ audio: Buffer.alloc(4000, 7), mimeType: 'audio/webm;codecs=opus', durationMs: 2500 });

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
  alice = await signUp('host');
  bob = await signUp('member');
  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  const features = await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { meetings: true, aiAssistant: true, chat: true } }, root);
  assert.equal(features.status, 200, JSON.stringify(features.body));
  assert.equal((await asAlice('POST', '/workspace/invitations', { email: bob.email })).status, 201);

  const created = await asAlice('POST', '/projects', { name: 'Launch', key: `LA${stamp.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'X')}` });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
  assert.equal((await asAlice('POST', `/projects/${project.id}/members`, { email: bob.email, role: 'member' })).status, 201);
  const overdue = await asAlice('POST', '/issues', { projectId: project.id, title: 'Fix checkout', dueDate: '2020-01-01' });
  assert.equal(overdue.status, 201, JSON.stringify(overdue.body));

  const scheduled = await asAlice('POST', '/meetings', {
    title: 'Launch sync',
    startsAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    durationMinutes: 30,
    participantIds: [bob.user.id],
    contextType: 'project',
    contextId: project.id,
  });
  assert.equal(scheduled.status, 201, JSON.stringify(scheduled.body));
  meeting = scheduled.body.meeting;
  aliceSocket = await connect(alice.token);
  bobSocket = await connect(bob.token);
  assert.equal((await ask(aliceSocket, 'meeting:join', { meetingId: meeting.id, media: {} })).ok, true);
  assert.equal((await ask(bobSocket, 'meeting:join', { meetingId: meeting.id, media: {} })).ok, true);
});

after(async () => {
  aliceSocket?.disconnect();
  bobSocket?.disconnect();
  await server?.stop();
  await new Promise((resolve) => fake?.close(resolve));
});

// --- Tests ------------------------------------------------------------------------------------------------------------

describe('before the meeting', () => {
  it('says the AI assistant is available', async () => {
    assert.equal((await asAlice('GET', '/meetings/capabilities')).body.ai, true);
  });

  it('drafts the agenda with the AI assistant from the project', async () => {
    const agenda = await asAlice('POST', '/meetings/agenda-draft', { title: 'Launch sync', durationMinutes: 30, contextType: 'project', contextId: project.id });
    assert.equal(agenda.status, 200, JSON.stringify(agenda.body));
    assert.equal(agenda.body.source, 'ai');
    assert.match(agenda.body.agenda, /Launch review/);
    assert.match(agenda.body.agenda, /Overdue work/, 'the overdue task was part of what the assistant read');
  });
});

describe('during the call', () => {
  it('turns speech into captions and the transcript (AI notes)', async () => {
    const told = next(bobSocket, 'meeting:transcribing', (payload) => payload.transcribing);
    assert.equal((await ask(aliceSocket, 'meeting:transcribe', { on: true })).ok, true);
    assert.equal((await told).transcribing.mode, 'ai');
    const caption = next(aliceSocket, 'meeting:caption', (item) => item.text === SPOKEN);
    assert.equal((await ask(bobSocket, 'meeting:audio', speech())).ok, true);
    const received = await caption;
    assert.equal(received.speaker.id, bob.user.id);
    assert.equal(received.final, true);
  });

  it('refuses recordings that are not audio, and phone audio from people not running the call', async () => {
    assert.equal((await ask(bobSocket, 'meeting:audio', { ...speech(), mimeType: 'text/html' })).ok, false);
    assert.equal((await ask(bobSocket, 'meeting:audio', { ...speech(), audio: Buffer.alloc(10) })).ok, false);
    assert.equal((await ask(bobSocket, 'meeting:audio', { ...speech(), phone: { identity: 'sip_1', name: 'Caller' } })).ok, false);
  });

  it('translates captions for the people who chose a language', async () => {
    assert.equal((await ask(aliceSocket, 'meeting:caption-language', { language: 'hi' })).ok, true);
    const translated = next(aliceSocket, 'meeting:caption-translation', (item) => item.language === 'hi');
    assert.equal((await ask(bobSocket, 'meeting:audio', speech())).ok, true);
    assert.equal((await translated).text, `[hi] ${SPOKEN}`);
    assert.equal((await ask(aliceSocket, 'meeting:caption-language', { language: 'xx' })).language, null, 'unknown languages turn translation off');
  });

  it('catches people up from what was said', async () => {
    const answer = await ask(bobSocket, 'meeting:ai:ask', {});
    assert.equal(answer.ok, true, answer.error);
    assert.match(answer.answer, /pricing page/);
  });

  it('points out similar questions, merges them, and drafts answers for the host', async () => {
    const first = await ask(bobSocket, 'meeting:qa:ask', { text: 'When do we ship?' });
    assert.ok(first.question, JSON.stringify(first));
    const similar = await ask(aliceSocket, 'meeting:qa:ask', { text: 'When will we ship it?' });
    assert.equal(similar.similar?.id, first.question.id, 'not posted: a similar question is open');
    const forced = await ask(aliceSocket, 'meeting:qa:ask', { text: 'When will we ship it?', force: true });
    assert.ok(forced.question);

    assert.equal((await ask(bobSocket, 'meeting:qa:merge')).ok, false, 'only the host merges');
    const merged = await ask(aliceSocket, 'meeting:qa:merge');
    assert.equal(merged.merged, 1);
    const left = (await ask(aliceSocket, 'meeting:qa:list')).questions;
    assert.equal(left.length, 1);
    assert.ok(left[0].voters.includes(alice.user.id), 'the merged question’s author now votes for the one kept');

    assert.equal((await ask(bobSocket, 'meeting:qa:draft', { questionId: left[0].id })).ok, false);
    const draft = await ask(aliceSocket, 'meeting:qa:draft', { questionId: left[0].id });
    assert.equal(draft.draft, 'We ship on Friday.');
    const published = next(bobSocket, 'meeting:qa', (item) => item.id === left[0].id && item.answer);
    assert.equal((await ask(aliceSocket, 'meeting:qa:answer', { questionId: left[0].id, answered: true, answer: draft.draft })).ok, true);
    assert.equal((await published).answer, 'We ship on Friday.');
  });
});

describe('after the meeting', () => {
  let summary;

  it('writes the summary with owners and chapters, and sends the recap', async () => {
    // Chapters need a call long enough to have topics (a dozen lines or more).
    for (let index = 0; index < 12; index += 1) assert.equal((await ask(bobSocket, 'meeting:audio', speech())).ok, true);
    assert.equal((await asAlice('POST', `/meetings/${meeting.id}/end`)).status, 200);
    for (let attempt = 0; attempt < 40 && !summary; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      summary = (await asBob('GET', `/meetings/${meeting.id}`)).body.meeting.summary;
    }
    assert.ok(summary, 'summary written');
    assert.equal(summary.actionItems[0].ownerId, bob.user.id, 'the owner was matched to the invited person');
    assert.equal(summary.actionItems[0].due, '2026-11-06');
    assert.equal(summary.chapters[0].title, 'Launch plan');

    let recap = null;
    for (let attempt = 0; attempt < 20 && !recap; attempt += 1) {
      const notifications = (await asBob('GET', '/notifications')).body;
      recap = (notifications.notifications ?? notifications.items ?? notifications).find?.((item) => item.type === 'meeting_recap') ?? null;
      if (!recap) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(recap, 'bob got the recap in his inbox');
    const chat = (await asBob('GET', `/projects/${project.id}/chat/messages`)).body;
    assert.ok((chat.messages ?? []).some((message) => message.meta?.type === 'meeting_recap'), 'the recap was posted in the project chat');
  });

  it('finds what was said by meaning', async () => {
    const found = (await asBob('GET', '/meetings/search?q=pricing page')).body;
    assert.equal(found.mode, 'meaning');
    assert.ok(found.results.some((result) => result.kind === 'transcript' && result.meeting.id === meeting.id), JSON.stringify(found));
  });

  it('turns action items into tasks, once', async () => {
    const items = [{ index: 0, title: 'Update the pricing page', assigneeId: bob.user.id, dueDate: '2026-11-06', priority: 'high' }];
    const created = await asBob('POST', `/meetings/${meeting.id}/action-items/tasks`, { projectId: project.id, items });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const [task] = created.body.created;
    assert.ok(task.key);
    assert.equal(created.body.summary.actionItems[0].issue.key, task.key);
    const issue = (await asBob('GET', `/issues/${task.key}`)).body.issue;
    assert.equal(issue.assignee?.id ?? issue.assigneeId, bob.user.id);
    assert.equal(issue.dueDate, '2026-11-06');
    const again = await asBob('POST', `/meetings/${meeting.id}/action-items/tasks`, { projectId: project.id, items });
    assert.equal(again.body.created.length, 0, 'each action item becomes one task');
  });
});
