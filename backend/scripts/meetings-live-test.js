/* End-to-end check of live meeting features against a running backend (npm run dev). Creates a temporary meeting
   between two members of one organization, exercises the call over sockets, then deletes it. */
import { createRequire } from 'node:module';
import { Meeting, MeetingParticipant, OrganizationMember } from '../src/database/models.js';
import { signAccessToken } from '../src/modules/auth/token.js';

const require = createRequire(import.meta.url);
const { io } = require('../../frontend/node_modules/socket.io-client');
const BASE = process.env.API_URL ?? 'http://localhost:4000';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
const ask = (socket, event, payload = {}) => new Promise((resolve) => socket.timeout(5000).emit(event, payload, (error, response) => resolve(error ? { ok: false, error: 'timeout' } : response)));
const next = (socket, event, ms = 4000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const admins = await OrganizationMember.findAll({ where: { role: 'admin', status: 'active' }, raw: true });
let pair = null;
for (const admin of admins) {
  const other = await OrganizationMember.findOne({ where: { organizationId: admin.organizationId, status: 'active' }, raw: true, order: [['createdAt', 'DESC']] });
  if (other && other.userId !== admin.userId) {
    pair = { organizationId: admin.organizationId, host: admin.userId, member: other.userId };
    break;
  }
}
if (!pair) {
  console.log('Need an organization with an admin and one more active member.');
  process.exit(1);
}

const meeting = await Meeting.create({
  organizationId: pair.organizationId,
  hostId: pair.host,
  title: 'Automated live test',
  startsAt: new Date(),
  durationMinutes: 30,
  guestToken: `test-${Date.now()}`,
});
await MeetingParticipant.create({ meetingId: meeting.id, userId: pair.member });

const sockets = [];
try {
  const host = await connect(signAccessToken({ id: pair.host, email: 'host@test' }));
  const member = await connect(signAccessToken({ id: pair.member, email: 'member@test' }));
  sockets.push(host, member);

  const hostJoin = await ask(host, 'meeting:join', { meetingId: meeting.id, media: { audio: true, video: false } });
  check('host joins', hostJoin.ok && hostJoin.canManage === true, hostJoin.error);
  const peerJoined = next(host, 'meeting:peer-joined');
  const memberJoin = await ask(member, 'meeting:join', { meetingId: meeting.id, media: { audio: true, video: true } });
  check('member joins and sees the host', memberJoin.ok && memberJoin.peers.length === 1 && memberJoin.canManage === false, memberJoin.error);
  check('host is told about the member', Boolean(await peerJoined));

  const chatSeen = next(member, 'meeting:chat');
  const sent = await ask(host, 'meeting:chat', { body: 'Hello team' });
  const message = await chatSeen;
  check('chat reaches the other person', sent.ok && message?.body === 'Hello team');

  const handSeen = next(host, 'meeting:peer-hand');
  member.emit('meeting:hand', { raised: true });
  check('raised hand is shared', Boolean((await handSeen)?.hand));
  const reactionSeen = next(host, 'meeting:reaction');
  member.emit('meeting:reaction', { emoji: '🎉' });
  check('reaction is shared', (await reactionSeen)?.emoji === '🎉');

  const pollSeen = next(member, 'meeting:poll');
  const created = await ask(host, 'meeting:poll:create', { question: 'Ship today?', options: ['Yes', 'No'] });
  check('poll is created and shared', created.ok && Boolean(await pollSeen), created.error);
  const voted = await ask(member, 'meeting:poll:vote', { pollId: created.poll.id, option: 0 });
  check('vote is counted', voted.ok && voted.poll.options[0].votes === 1 && voted.poll.myVote === 0, voted.error);

  const strokeSeen = next(member, 'meeting:wb:stroke');
  host.emit('meeting:wb:stroke', { id: 'stroke1', color: '#ef4444', width: 6, tool: 'pen', points: [0.1, 0.1, 0.2, 0.2] });
  check('whiteboard stroke is shared', (await strokeSeen)?.points?.length === 4);
  const shared = await ask(member, 'meeting:collab');
  check('late state has polls and board', shared.ok && shared.polls.length === 1 && shared.board.strokes.length === 1);

  const movedHost = next(host, 'meeting:moved');
  const movedMember = next(member, 'meeting:moved');
  const opened = await ask(host, 'meeting:breakouts:open', { rooms: [{ name: 'A', socketIds: [member.id] }, { name: 'B', socketIds: [] }] });
  const [hostMove, memberMove] = await Promise.all([movedHost, movedMember]);
  check('breakout rooms split the call', opened.ok && memberMove?.room === 'room-1' && memberMove.peers.length === 0 && hostMove?.peers.length === 0, opened.error);
  const notAllowed = await ask(member, 'meeting:breakouts:close');
  check('only the host closes rooms', !notAllowed.ok);
  const back = next(member, 'meeting:moved');
  const closed = await ask(host, 'meeting:breakouts:close');
  check('closing rooms brings everyone back', closed.ok && (await back)?.peers.length === 1);

  const pass = await fetch(`${BASE}/api/meeting-links/${meeting.guestToken}/guests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor' }),
  }).then((response) => response.json());
  check('guest gets a pass', Boolean(pass.token && pass.guest), pass.message);
  const guest = await connect(pass.token);
  sockets.push(guest);
  const lobbySeen = next(host, 'meeting:lobby');
  const waiting = await ask(guest, 'meeting:join', { meetingId: meeting.id, media: {} });
  const lobby = await lobbySeen;
  check('guest waits in the lobby', waiting.waiting === true && lobby?.length === 1);
  const admitted = next(guest, 'meeting:admitted');
  host.emit('meeting:admit', { socketId: guest.id, allow: true });
  check('host lets the guest in', Boolean(await admitted));
  const guestJoin = await ask(guest, 'meeting:join', { meetingId: meeting.id, media: {} });
  check('admitted guest joins', guestJoin.ok && guestJoin.peers.length === 2, guestJoin.error);
  const guestPoll = await ask(guest, 'meeting:poll:create', { question: 'x', options: ['a', 'b'] });
  check('guests cannot start polls', !guestPoll.ok);

  const apiPass = await fetch(`${BASE}/api/projects`, { headers: { Authorization: `Bearer ${pass.token}` } });
  check('guest pass opens no API', apiPass.status === 401);

  const closedSeen = Promise.all([next(host, 'meeting:closed'), next(member, 'meeting:closed'), next(guest, 'meeting:closed')]);
  const hostToken = signAccessToken({ id: pair.host, email: 'host@test' });
  const ended = await fetch(`${BASE}/api/meetings/${meeting.id}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hostToken}`, 'X-Organization-Id': pair.organizationId },
  });
  const closedAll = await closedSeen;
  check('ending sends everyone out', ended.ok && closedAll.every(Boolean), `status ${ended.status}`);

  // A daily meeting whose occurrence has started gets its next occurrence, same people, a day later.
  const { continueMeetingSeries } = await import('../src/modules/meetings/meeting.service.js');
  const startsAt = new Date(Date.now() - 60_000);
  await meeting.update({ status: 'scheduled', startsAt, recurrence: 'daily', seriesId: meeting.id, continued: false });
  await continueMeetingSeries();
  const following = await Meeting.findOne({ where: { seriesId: meeting.id, continued: false } });
  const invited = following ? await MeetingParticipant.count({ where: { meetingId: following.id, userId: pair.member } }) : 0;
  const hoursLater = following ? (following.startsAt - startsAt) / 3_600_000 : 0;
  check('repeating meeting schedules the next one', Boolean(following) && invited === 1 && hoursLater > 22 && hoursLater < 26, `${hoursLater.toFixed(1)} h later`);
  if (following) await Meeting.destroy({ where: { id: following.id } });
} catch (error) {
  check('no unexpected error', false, error.message);
} finally {
  sockets.forEach((socket) => socket.disconnect());
  await new Promise((resolve) => setTimeout(resolve, 500));
  await Meeting.destroy({ where: { id: meeting.id } });
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
