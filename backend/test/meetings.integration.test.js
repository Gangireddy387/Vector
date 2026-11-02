/*
 * Meeting features end to end against a real, isolated backend (see helpers/isolated-server.js): the lobby for
 * everyone, Q&A, whiteboard shapes, files in the chat, the breakout timer and the attendance report.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice; // organization admin and host
let bob; // invited member
let meeting;
let aliceSocket;
let bobSocket;
let rootToken;

async function signUp(label) {
  const email = `${label}-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Org`,
    organizationSlug: `${label}-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

/** Emits with an acknowledgement. */
const ask = (socket, event, payload = {}) =>
  new Promise((resolve) => socket.timeout(8000).emit(event, payload, (error, response) => resolve(error ? { ok: false, error: 'timeout' } : response)));

/** The next `event` on `socket` that passes `filter`. */
const next = (socket, event, filter = () => true, ms = 8000) =>
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

/** Nothing matching arrives within `ms`. */
const quiet = (socket, event, filter = () => true, ms = 800) =>
  next(socket, event, filter, ms).then(
    (payload) => assert.fail(`unexpected ${event}: ${JSON.stringify(payload)}`),
    () => undefined,
  );

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);
const asBob = (method, url, body) => call(method, url, body, bob.token, alice.organizationId);

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  alice = await signUp('host');
  bob = await signUp('member');

  // With a portal owner, new organizations wait for approval; meetings are a paid feature they turn on.
  const root = await call('POST', '/auth/login', ADMIN);
  assert.equal(root.status, 200, JSON.stringify(root.body));
  rootToken = root.body.token;
  const approved = await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root.body.token);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const enabled = await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { meetings: true } }, root.body.token);
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body));

  const invited = await call('POST', '/workspace/invitations', { email: bob.email }, alice.token, alice.organizationId);
  assert.equal(invited.status, 201, JSON.stringify(invited.body));

  const created = await asAlice('POST', '/meetings', {
    title: 'All hands',
    startsAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    durationMinutes: 30,
    participantIds: [bob.user.id],
    lobby: 'everyone',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  meeting = created.body.meeting;

  aliceSocket = await connect(alice.token);
  bobSocket = await connect(bob.token);
});

after(async () => {
  aliceSocket?.disconnect();
  bobSocket?.disconnect();
  await server?.stop();
});

describe('meeting settings', () => {
  it('keeps the lobby choice, and has no dial-in or calendar sync when the server has none', () => {
    assert.equal(meeting.lobby, 'everyone');
    assert.equal(meeting.dialIn, null);
    assert.equal(meeting.calendarSync, null);
  });

  it('reports what calls can do', async () => {
    const capabilities = await asAlice('GET', '/meetings/capabilities');
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.body.dialIn, false);
    assert.equal(typeof capabilities.body.fileMaxMb, 'number');
  });

  it('lists calendars that can be connected, and refuses one the server has not set up', async () => {
    const list = await asAlice('GET', '/calendar-sync/connections');
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.calendars.map((item) => [item.provider, item.available, item.connection]),
      [
        ['google', false, null],
        ['microsoft', false, null],
      ],
    );
    assert.equal((await asAlice('POST', '/calendar-sync/google/connect')).status, 400);
    assert.equal((await asAlice('POST', '/calendar-sync/yahoo/connect')).status, 404);
  });

  it('sends the browser back to settings when the calendar sign-in is not genuine', async () => {
    const response = await fetch(`${server.api}/calendar/oauth/google/callback?code=x&state=forged`, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.match(response.headers.get('location'), /\/settings\?calendar=expired/);
  });

  it('refuses LiveKit webhooks when there is no media server', async () => {
    const response = await fetch(`${server.api}/livekit/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/webhook+json' }, body: '{}' });
    assert.equal(response.status, 404);
  });
});

describe('a call', () => {
  it('lets the host in, and makes an invited member wait in the lobby for everyone', async () => {
    const hostJoined = await ask(aliceSocket, 'meeting:join', { meetingId: meeting.id, media: { audio: false, video: false } });
    assert.equal(hostJoined.ok, true, hostJoined.error);
    assert.equal(hostJoined.lobbyMode, 'everyone');

    const lobby = next(aliceSocket, 'meeting:lobby', (list) => list.length === 1);
    const waiting = await ask(bobSocket, 'meeting:join', { meetingId: meeting.id, media: { audio: false, video: false } });
    assert.equal(waiting.waiting, true);
    assert.equal(waiting.alone, false);
    const [entry] = await lobby;
    assert.equal(entry.user.id, bob.user.id);
    assert.equal(entry.guest, false);

    const admitted = next(bobSocket, 'meeting:admitted');
    aliceSocket.emit('meeting:admit', { socketId: bobSocket.id, allow: true });
    await admitted;
    const joined = await ask(bobSocket, 'meeting:join', { meetingId: meeting.id, media: { audio: false, video: false } });
    assert.equal(joined.ok, true, joined.error);
    assert.equal(joined.canManage, false);
  });

  it('lets only the people running the call change the lobby', async () => {
    assert.equal((await ask(bobSocket, 'meeting:lobby-mode', { mode: 'guests' })).ok, false);
    const told = next(bobSocket, 'meeting:lobby-mode');
    assert.equal((await ask(aliceSocket, 'meeting:lobby-mode', { mode: 'guests' })).ok, true);
    assert.equal((await told).mode, 'guests');
    assert.equal((await asAlice('GET', `/meetings/${meeting.id}`)).body.meeting.lobby, 'guests');
  });

  it('runs Q&A: ask, upvote (not your own), answer, remove', async () => {
    const seen = next(aliceSocket, 'meeting:qa', (question) => question.text === 'When do we ship?');
    const asked = await ask(bobSocket, 'meeting:qa:ask', { text: '  When do we ship?  ' });
    assert.equal(asked.ok, true, asked.error);
    const question = await seen;
    assert.equal(question.votes, 0);

    assert.equal((await ask(bobSocket, 'meeting:qa:upvote', { questionId: question.id })).ok, false, 'no votes for your own question');
    const voted = next(bobSocket, 'meeting:qa', (item) => item.id === question.id && item.votes === 1);
    assert.equal((await ask(aliceSocket, 'meeting:qa:upvote', { questionId: question.id })).ok, true);
    assert.deepEqual((await voted).voters, [alice.user.id]);

    assert.equal((await ask(bobSocket, 'meeting:qa:answer', { questionId: question.id })).ok, false, 'only the host marks answers');
    const answered = next(bobSocket, 'meeting:qa', (item) => item.id === question.id && item.answeredAt);
    assert.equal((await ask(aliceSocket, 'meeting:qa:answer', { questionId: question.id })).ok, true);
    await answered;

    const second = await ask(bobSocket, 'meeting:qa:ask', { text: 'Remove me' });
    const removed = next(aliceSocket, 'meeting:qa:removed', (item) => item.id === second.question.id);
    assert.equal((await ask(bobSocket, 'meeting:qa:remove', { questionId: second.question.id })).ok, true);
    await removed;

    const list = await ask(aliceSocket, 'meeting:qa:list');
    assert.equal(list.questions.length, 1);
  });

  it('shares whiteboard shapes, text and notes, and refuses broken ones', async () => {
    const shape = next(bobSocket, 'meeting:wb:stroke', (stroke) => stroke.id === 'rect-1');
    aliceSocket.emit('meeting:wb:stroke', { id: 'rect-1', kind: 'rect', color: '#2563eb', width: 6, points: [0.1, 0.1, 0.4, 0.3] });
    const received = await shape;
    assert.equal(received.kind, 'rect');
    assert.deepEqual(received.points, [0.1, 0.1, 0.4, 0.3]);

    const note = next(bobSocket, 'meeting:wb:stroke', (stroke) => stroke.id === 'note-1');
    aliceSocket.emit('meeting:wb:stroke', { id: 'note-1', kind: 'note', color: '#f59e0b', width: 6, points: [0.5, 0.5], text: 'Ship Friday' });
    assert.equal((await note).text, 'Ship Friday');

    const broken = quiet(bobSocket, 'meeting:wb:stroke', (stroke) => stroke.id.startsWith('bad-'));
    aliceSocket.emit('meeting:wb:stroke', { id: 'bad-1', kind: 'star', points: [0.1, 0.1, 0.2, 0.2] });
    aliceSocket.emit('meeting:wb:stroke', { id: 'bad-2', kind: 'text', points: [0.1, 0.1] });
    aliceSocket.emit('meeting:wb:stroke', { id: 'bad-3', kind: 'rect', points: [0.1, 0.1] });
    await broken;
  });

  it('shares files in the chat through short-lived links', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello from the call'], { type: 'text/plain' }), 'notes.txt');
    const uploaded = await fetch(`${server.api}/meetings/${meeting.id}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}`, 'X-Organization-Id': alice.organizationId },
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const { file } = await uploaded.json();
    assert.equal(file.fileName, 'notes.txt');
    assert.equal('storageKey' in file, false);

    assert.equal((await ask(bobSocket, 'meeting:chat', { body: 'mine now', fileId: file.id })).ok, false, 'only who uploaded a file shares it');

    const message = next(bobSocket, 'meeting:chat', (item) => item.attachment?.id === file.id);
    assert.equal((await ask(aliceSocket, 'meeting:chat', { body: 'Agenda attached', fileId: file.id })).ok, true);
    assert.equal((await message).attachment.fileName, 'notes.txt');

    const link = await ask(bobSocket, 'meeting:file-link', { fileId: file.id });
    assert.equal(link.ok, true, link.error);
    const download = await fetch(`${server.base}${link.url}`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'hello from the call');
    assert.match(download.headers.get('content-disposition') ?? '', /attachment/);

    const forged = await fetch(`${server.base}${link.url.replace(/token=[^&]+/, 'token=forged')}`);
    assert.equal(forged.status, 401);
  });

  it('opens breakout rooms with a time limit, extends them, and brings everyone back', async () => {
    const state = next(aliceSocket, 'meeting:breakouts', (value) => value?.endsAt);
    const opened = await ask(aliceSocket, 'meeting:breakouts:open', { rooms: [{ name: 'Red', socketIds: [bobSocket.id] }, { name: 'Blue', socketIds: [] }], minutes: 10 });
    assert.equal(opened.ok, true, opened.error);
    const first = new Date((await state).endsAt).getTime();
    assert.ok(Math.abs(first - (Date.now() + 10 * 60_000)) < 15_000);

    assert.equal((await ask(bobSocket, 'meeting:breakouts:extend', { minutes: 5 })).ok, false, 'only the host changes the time');
    const extended = next(aliceSocket, 'meeting:breakouts', (value) => value && new Date(value.endsAt).getTime() > first);
    assert.equal((await ask(aliceSocket, 'meeting:breakouts:extend', { minutes: 5 })).ok, true);
    assert.ok(Math.abs(new Date((await extended).endsAt).getTime() - (first + 5 * 60_000)) < 1000);

    const ended = next(bobSocket, 'meeting:breakouts:ended');
    assert.equal((await ask(aliceSocket, 'meeting:breakouts:close')).ok, true);
    assert.equal((await ended).reason, 'host');
  });

  it('keeps an attendance report for the host only', async () => {
    bobSocket.emit('meeting:leave');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal((await asBob('GET', `/meetings/${meeting.id}/attendance`)).status, 403);
    const report = await asAlice('GET', `/meetings/${meeting.id}/attendance`);
    assert.equal(report.status, 200, JSON.stringify(report.body));
    const byUser = new Map(report.body.attendance.map((entry) => [entry.userId, entry]));
    assert.equal(byUser.get(alice.user.id)?.inCall, true);
    const bobEntry = byUser.get(bob.user.id);
    assert.equal(bobEntry?.inCall, false);
    assert.equal(bobEntry.sessions, 1);
    assert.ok(bobEntry.lastLeftAt);

    const details = await asAlice('GET', `/meetings/${meeting.id}`);
    assert.equal(details.body.questions.length, 1);
    assert.equal(details.body.files.length, 1);
    assert.equal(details.body.chat.at(-1).attachment.fileName, 'notes.txt');
    assert.ok(Array.isArray(details.body.attendance));
    assert.equal((await asBob('GET', `/meetings/${meeting.id}`)).body.attendance, null);
  });
});

describe('removing an organization (super admin)', () => {
  const remove = (organizationId, confirmName, token = rootToken) => call('DELETE', `/super-admin/organizations/${organizationId}`, { confirmName }, token);

  it('is only for the super admin, with the exact name typed', async () => {
    assert.equal((await remove(alice.organizationId, 'host Org', alice.token)).status, 403);
    assert.equal((await remove(alice.organizationId, 'Not the name')).status, 400);
    assert.equal((await remove('00000000-0000-0000-0000-000000000000', 'x')).status, 404);
  });

  it('removes a signup completely, so the same email can sign up again', async () => {
    const spam = await signUp('spam');
    const removed = await remove(spam.organizationId, 'spam Org');
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.removedAccounts, 1);
    const list = await call('GET', '/super-admin/organizations', null, rootToken);
    assert.equal(list.body.organizations.some((item) => item.id === spam.organizationId), false);
    assert.equal((await call('POST', '/auth/login', { email: spam.email, password: PASSWORD })).status, 401);
    assert.equal((await call('GET', '/auth/me', null, spam.token)).status, 401);
    const again = await call('POST', '/auth/register', { name: 'Spam Again', email: spam.email, password: PASSWORD, organizationName: 'Spam Two', organizationSlug: `spam2-${stamp}` });
    assert.equal(again.status, 201, JSON.stringify(again.body));
  });

  it('removes an organization with meetings and files, keeping people who belong elsewhere', async () => {
    const told = next(bobSocket, 'workspace:removed', (payload) => payload.id === alice.organizationId);
    const removed = await remove(alice.organizationId, 'host Org');
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.removedAccounts, 1, 'only the host belonged to nothing else');
    await told;
    assert.equal((await call('GET', '/auth/me', null, bob.token)).status, 200, 'bob keeps his account and his own organization');
    assert.notEqual((await asBob('GET', `/meetings/${meeting.id}`)).status, 200);
    assert.equal((await call('POST', '/auth/login', { email: alice.email, password: PASSWORD })).status, 401);
  });
});
