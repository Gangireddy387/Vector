/*
 * Team channels end to end against a real, isolated backend (see helpers/isolated-server.js): standard and private
 * channels, who sees them, threaded replies, renaming, members and deleting.
 * Run with `node --test test/channels.integration.test.js`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io } from 'socket.io-client';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ROOT = { email: `root-channels-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let alice; // organization admin
let bob; // in the team
let dave; // in the team
let carol; // in the organization, not in the team
let team;
let general;

async function signUp(label) {
  const email = `${label}-${stamp}@example.test`;
  const response = await call('POST', '/auth/register', {
    name: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `${label} Org`,
    organizationSlug: `${label}-ch-${stamp}`.toLowerCase(),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { email, token: response.body.token, user: response.body.user, organizationId: response.body.organization.id };
}

const as = (person) => (method, url, body) => call(method, url, body, person.token, alice.organizationId);

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(server.base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

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
const listOf = async (person) => {
  const response = await as(person)('GET', '/conversations');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.conversations;
};

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ROOT.email, SUPER_ADMIN_PASSWORD: ROOT.password } });
  call = apiClient(server.api);
  alice = await signUp('alice');
  bob = await signUp('bob');
  dave = await signUp('dave');
  carol = await signUp('carol');

  const root = (await call('POST', '/auth/login', ROOT)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, root)).status, 200);
  const enabled = await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { teamChat: true } }, root);
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body));

  for (const person of [bob, dave, carol]) {
    const invited = await as(alice)('POST', '/workspace/invitations', { email: person.email });
    assert.equal(invited.status, 201, JSON.stringify(invited.body));
  }
  const department = await as(alice)('POST', '/departments', { name: 'Engineering' });
  assert.equal(department.status, 201, JSON.stringify(department.body));
  const departmentId = department.body.departments.find((item) => item.name === 'Engineering').id;
  const created = await as(alice)('POST', `/departments/${departmentId}/teams`, { name: 'Platform', memberIds: [bob.user.id, dave.user.id] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  team = created.body.departments.flatMap((item) => item.teams ?? []).find((item) => item.name === 'Platform');
  assert.ok(team, 'the team is listed');
  general = (await listOf(bob)).find((conversation) => conversation.kind === 'team' && conversation.team?.id === team.id);
  assert.ok(general, 'the team has its General chat');
});

after(async () => {
  await server?.stop();
});

describe('team channels', () => {
  let standard;
  let secret;

  it('lets a team member add a standard channel that the whole team sees', async () => {
    const created = await as(bob)('POST', '/channels', { teamId: team.id, name: 'Releases', description: 'What ships when' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    standard = created.body.conversation;
    assert.equal(standard.kind, 'channel');
    assert.equal(standard.title, 'Releases');
    assert.equal(standard.channel.privacy, 'standard');
    assert.equal(standard.channel.canManage, true, 'the creator manages it');

    assert.ok((await listOf(dave)).some((conversation) => conversation.id === standard.id), 'the rest of the team sees it');
    assert.ok((await listOf(alice)).some((conversation) => conversation.id === standard.id), 'admins see it');
    assert.ok(!(await listOf(carol)).some((conversation) => conversation.id === standard.id), 'people outside the team do not');
    assert.equal((await as(carol)('GET', `/conversations/${standard.id}`)).status, 404);
  });

  it('refuses a second channel with the same name, and the General name', async () => {
    assert.equal((await as(dave)('POST', '/channels', { teamId: team.id, name: 'releases' })).status, 409);
    assert.equal((await as(dave)('POST', '/channels', { teamId: team.id, name: 'General' })).status, 400);
    assert.equal((await as(carol)('POST', '/channels', { teamId: team.id, name: 'Outsiders' })).status, 404, 'only the team can add channels');
  });

  it('keeps a private channel to the people added to it', async () => {
    const created = await as(bob)('POST', '/channels', { teamId: team.id, name: 'Hiring', privacy: 'private', memberIds: [carol.user.id] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    secret = created.body.conversation;
    assert.equal(secret.channel.privacy, 'private');
    assert.equal(secret.memberCount, 1, 'only the creator: carol is not in the team');
    assert.ok(!(await listOf(dave)).some((conversation) => conversation.id === secret.id));
    assert.ok(!(await listOf(alice)).some((conversation) => conversation.id === secret.id), 'admins are not in private channels unless added');
    assert.equal((await as(dave)('GET', `/conversations/${secret.id}`)).status, 404);
  });

  it('adds and removes people from the team in a private channel', async () => {
    const roster = await as(bob)('GET', `/channels/${secret.channel.id}/members`);
    assert.equal(roster.status, 200, JSON.stringify(roster.body));
    assert.ok(roster.body.candidates.some((person) => person.id === dave.user.id));
    assert.ok(!roster.body.candidates.some((person) => person.id === carol.user.id), 'only team people can be added');

    assert.equal((await as(dave)('POST', `/channels/${secret.channel.id}/members`, { userIds: [dave.user.id] })).status, 404, 'outsiders cannot add themselves');
    const added = await as(bob)('POST', `/channels/${secret.channel.id}/members`, { userIds: [dave.user.id] });
    assert.equal(added.status, 200, JSON.stringify(added.body));
    assert.ok(added.body.members.some((person) => person.id === dave.user.id));
    assert.ok((await listOf(dave)).some((conversation) => conversation.id === secret.id));

    assert.equal((await as(dave)('DELETE', `/channels/${secret.channel.id}/members/${dave.user.id}`)).status, 204, 'anyone can leave');
    assert.ok(!(await listOf(dave)).some((conversation) => conversation.id === secret.id));
    assert.equal((await as(bob)('DELETE', `/channels/${secret.channel.id}/members/${bob.user.id}`)).status, 400, 'the last person cannot leave');
  });

  it('threads replies under a post, and tells the post author', async () => {
    const post = await as(bob)('POST', `/conversations/${standard.id}/messages`, { body: 'v2.3 goes out Friday' });
    assert.equal(post.status, 201, JSON.stringify(post.body));
    assert.equal(post.body.message.parentId, null);
    const reply = await as(dave)('POST', `/conversations/${standard.id}/messages`, { body: 'Docs are ready', parentId: post.body.message.id });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.message.parentId, post.body.message.id);
    assert.equal(
      (await as(dave)('POST', `/conversations/${standard.id}/messages`, { body: 'Nested', parentId: reply.body.message.id })).status,
      400,
      'replies are one level deep',
    );

    const thread = await as(alice)('GET', `/conversations/${standard.id}`);
    assert.equal(thread.status, 200);
    assert.deepEqual(
      thread.body.messages.map((message) => [message.body, message.parentId]),
      [
        ['v2.3 goes out Friday', null],
        ['Docs are ready', post.body.message.id],
      ],
    );

    const inbox = await as(bob)('GET', '/notifications');
    assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
    const notifications = inbox.body.notifications ?? inbox.body;
    assert.ok(
      notifications.some((item) => item.type === 'channel_reply' && item.link === `/messages/${standard.id}?post=${post.body.message.id}`),
      'the post author hears about the reply',
    );
  });

  it('threads replies in the General chat too', async () => {
    const post = await as(dave)('POST', `/conversations/${general.id}/messages`, { body: 'Stand-up moved to 10:00' });
    assert.equal(post.status, 201);
    assert.equal((await as(bob)('POST', `/conversations/${general.id}/messages`, { body: 'Thanks', parentId: post.body.message.id })).status, 201);
  });

  it('posts with a subject, @mentions, reactions and pins', async () => {
    const people = await as(dave)('GET', `/conversations/${standard.id}/people`);
    assert.equal(people.status, 200, JSON.stringify(people.body));
    assert.ok(people.body.people.some((person) => person.id === bob.user.id), 'the mention picker lists the team');
    assert.ok(!people.body.people.some((person) => person.id === carol.user.id));

    const post = await as(dave)('POST', `/conversations/${standard.id}/messages`, {
      subject: 'Release freeze',
      body: `Heads up @[bob Person](${bob.user.id}): no merges after Thursday`,
    });
    assert.equal(post.status, 201, JSON.stringify(post.body));
    assert.equal(post.body.message.subject, 'Release freeze');
    assert.deepEqual(post.body.message.reactions, []);
    const id = post.body.message.id;

    const inbox = (await as(bob)('GET', '/notifications')).body.notifications;
    assert.ok(inbox.some((item) => item.type === 'chat_mention' && item.link === `/messages/${standard.id}?post=${id}`), 'bob hears he was mentioned');

    const liked = await as(bob)('POST', `/conversations/${standard.id}/messages/${id}/reactions`, { emoji: '👍' });
    assert.equal(liked.status, 200, JSON.stringify(liked.body));
    await as(alice)('POST', `/conversations/${standard.id}/messages/${id}/reactions`, { emoji: '👍' });
    await as(alice)('POST', `/conversations/${standard.id}/messages/${id}/reactions`, { emoji: '🎉' });
    const undone = await as(bob)('POST', `/conversations/${standard.id}/messages/${id}/reactions`, { emoji: '👍' });
    assert.deepEqual(undone.body.reactions, [
      { emoji: '👍', userIds: [alice.user.id] },
      { emoji: '🎉', userIds: [alice.user.id] },
    ]);
    assert.equal((await as(bob)('POST', `/conversations/${standard.id}/messages/${id}/reactions`, { emoji: '🍕' })).status, 400, 'only the picker’s emojis');

    const pinned = await as(bob)('POST', `/conversations/${standard.id}/messages/${id}/pin`, { pinned: true });
    assert.equal(pinned.status, 200, JSON.stringify(pinned.body));
    assert.ok(pinned.body.message.pinnedAt);
    const reply = await as(bob)('POST', `/conversations/${standard.id}/messages`, { body: 'Noted', parentId: id });
    assert.equal((await as(bob)('POST', `/conversations/${standard.id}/messages/${reply.body.message.id}/pin`, { pinned: true })).status, 400, 'replies are not pinned');

    const thread = (await as(dave)('GET', `/conversations/${standard.id}`)).body.messages.find((message) => message.id === id);
    assert.ok(thread.pinnedAt);
    assert.equal(thread.reactions.length, 2);
    const unpinned = await as(dave)('POST', `/conversations/${standard.id}/messages/${id}/pin`, { pinned: false });
    assert.equal(unpinned.body.message.pinnedAt, null);
  });

  it('shares files in posts and lists them in the Files tab', async () => {
    const form = new FormData();
    form.append('file', new Blob(['release notes'], { type: 'text/plain' }), 'notes.txt');
    const uploaded = await fetch(`${server.api}/conversations/${standard.id}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dave.token}`, 'X-Organization-Id': alice.organizationId },
      body: form,
    });
    const { file } = await uploaded.json();
    assert.equal(uploaded.status, 201);
    assert.equal(file.fileName, 'notes.txt');

    assert.equal((await as(bob)('POST', `/conversations/${standard.id}/messages`, { fileIds: [file.id] })).status, 400, 'only the uploader can share it');
    const post = await as(dave)('POST', `/conversations/${standard.id}/messages`, { fileIds: [file.id], important: true });
    assert.equal(post.status, 201, JSON.stringify(post.body));
    assert.equal(post.body.message.body, '', 'a post can be only files');
    assert.equal(post.body.message.important, true);
    assert.deepEqual(post.body.message.files.map((item) => item.fileName), ['notes.txt']);

    const files = await as(bob)('GET', `/conversations/${standard.id}/files`);
    assert.equal(files.status, 200, JSON.stringify(files.body));
    assert.equal(files.body.files[0].postId, post.body.message.id);
    const link = await as(bob)('GET', `/conversations/${standard.id}/files/${file.id}/link`);
    assert.equal(link.status, 200);
    const download = await fetch(`${server.base}${link.body.url}`);
    assert.equal(await download.text(), 'release notes');
    assert.equal((await as(carol)('GET', `/conversations/${standard.id}/files/${file.id}/link`)).status, 404, 'outsiders get no link');
  });

  it('mentions everyone, saves posts, mutes and marks unread', async () => {
    const post = await as(alice)('POST', `/conversations/${standard.id}/messages`, { body: `@[everyone](00000000-0000-0000-0000-000000000000) retro at 4` });
    assert.equal(post.status, 201);
    const id = post.body.message.id;
    for (const person of [bob, dave]) {
      const inbox = (await as(person)('GET', '/notifications')).body.notifications;
      assert.ok(inbox.some((item) => item.type === 'chat_mention' && item.title.includes('mentioned everyone')), `${person.email} hears @everyone`);
    }

    assert.equal((await as(bob)('POST', `/conversations/${standard.id}/messages/${id}/save`, { saved: true })).status, 200);
    const saved = await as(bob)('GET', '/conversations/saved');
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.items[0].message.id, id);
    assert.equal(saved.body.items[0].conversation.title, 'Releases');
    assert.deepEqual((await as(bob)('GET', `/conversations/${standard.id}`)).body.savedIds, [id]);
    assert.deepEqual((await as(dave)('GET', `/conversations/${standard.id}`)).body.savedIds, [], 'saves are private');

    const muted = await as(bob)('POST', `/conversations/${standard.id}/mute`, { muted: true });
    assert.equal(muted.body.conversation.muted, true);
    assert.equal((await listOf(dave)).find((conversation) => conversation.id === standard.id).muted, false, 'muting is personal');

    await as(bob)('POST', `/conversations/${standard.id}/read`);
    const unread = await as(bob)('POST', `/conversations/${standard.id}/unread`, { messageId: id });
    assert.equal(unread.status, 200);
    assert.ok(unread.body.conversation.unread >= 1);
  });

  it('tells the others who is typing', async () => {
    const [bobSocket, daveSocket, carolSocket] = await Promise.all([bob, dave, carol].map((person) => connect(person.token)));
    try {
      const heard = next(daveSocket, 'conversation:typing', (event) => event.conversationId === standard.id);
      const outsider = next(carolSocket, 'conversation:typing', () => true, 800).then(
        () => assert.fail('carol is not in the channel'),
        () => undefined,
      );
      bobSocket.emit('conversation:typing', { conversationId: standard.id });
      const event = await heard;
      assert.equal(event.userId, bob.user.id);
      assert.equal(event.name, 'bob Person');
      await outsider;
    } finally {
      [bobSocket, daveSocket, carolSocket].forEach((socket) => socket.disconnect());
    }
  });

  it('shows a profile card of people in the organization only', async () => {
    const card = await as(dave)('GET', `/users/${bob.user.id}/card`);
    assert.equal(card.status, 200, JSON.stringify(card.body));
    assert.equal(card.body.user.name, 'bob Person');
    assert.equal(typeof card.body.user.timezone, 'string');
    assert.equal(card.body.user.phone, undefined, 'private details stay out');
    const outsider = await signUp('outsider');
    assert.equal((await as(dave)('GET', `/users/${outsider.user.id}/card`)).status, 404);
    assert.equal((await as(dave)('GET', '/users/not-a-uuid/card')).status, 404);
  });

  it('lets only managers rename or delete a channel', async () => {
    assert.equal((await as(dave)('PATCH', `/channels/${standard.channel.id}`, { name: 'Shipping' })).status, 403);
    const renamed = await as(alice)('PATCH', `/channels/${standard.channel.id}`, { name: 'Shipping' });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.conversation.title, 'Shipping');

    assert.equal((await as(dave)('DELETE', `/channels/${standard.channel.id}`)).status, 403);
    assert.equal((await as(bob)('DELETE', `/channels/${standard.channel.id}`)).status, 204);
    assert.ok(!(await listOf(dave)).some((conversation) => conversation.id === standard.id));
    assert.equal((await as(dave)('GET', `/conversations/${standard.id}`)).status, 404);
  });
});
