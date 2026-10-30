import { Op } from 'sequelize';
import { Meeting, MeetingChatMessage, MeetingParticipant, MeetingRecording, MeetingTranscriptLine, Organization, OrganizationMember, User } from '../../database/models.js';
import { shared } from '../../shared/realtime/shared-state.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { callCapacity, mediaFor, sfuApplyPermissions, sfuEnabled, sfuMuteMicrophone, sfuRemove, sfuStopScreen } from './meeting.media.js';
import { knockHost, ringInvitees } from './meeting.ring.js';

/**
 * The live side of meetings. The server keeps who is in each call and passes connection details along; video goes
 * between browsers directly, or through a LiveKit media server when one is configured (see meeting.media.js).
 *
 * Breakout rooms split a call: only people in the same room see and hear each other. Guests (people outside the
 * organization with the meeting's guest link) wait in a lobby until someone in the call lets them in.
 *
 * The host (and organization admins) run the call; they can make people co-hosts for it. Both can mute people, stop
 * their screen sharing, remove them, lock the call, decide whether others may chat, share or unmute, spotlight
 * someone for everyone, record, and turn on live captions. All of that lasts until the call empties.
 *
 * Call state is kept in the shared store (Redis when configured), so every backend server sees the same calls; each
 * change runs under a per-call lock.
 */
export const REACTIONS = ['👍', '👏', '😂', '🎉', '❤️', '😮', '🙏', '🤔'];
const MAX_BREAKOUT_ROOMS = 6;
const CHAT_HISTORY = 200;
const CHAT_BURST = { messages: 10, perMs: 10_000 };
const CAPTION_BURST = { messages: 30, perMs: 10_000 };
const CALL_TTL_SECONDS = 24 * 60 * 60;
/** Starting a call this long before its time rings nobody; people are reminded when the time comes. */
const RING_EARLY_MS = 15 * 60_000;
const GUEST_COLORS = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#ef4444', '#6366f1'];
const DEFAULT_PERMISSIONS = { chat: true, share: true, unmute: true };

/**
 * A call, as stored under `call:<meetingId>`:
 *   peers: socketId → { socketId, user, media, hand, room, role, canManage, guest },
 *   lobby: socketId → { socketId, user, since }   (guests waiting to be let in),
 *   admitted: guest ids let in (kept across their reconnects),
 *   cohosts: user ids the host made co-hosts,
 *   removed: user ids sent out of the call, who cannot come back while it lasts,
 *   locked: nobody new may join; `allowed` are the people who were in when it was locked (so they can reconnect),
 *   permissions: { chat, share, unmute } for people who do not run the call,
 *   spotlight: socket id everyone sees large, or null,
 *   recording: null | { socketId, userId, by, since, recordingId },
 *   transcribing: null | { by, since },
 *   breakouts: null | { rooms: [{ id, name }] },
 *   boardOpen: whether the whiteboard is the main view.
 *
 * A peer's `role` is 'host' (the meeting's host), 'admin' (an organization admin), 'cohost', or null.
 */
const emptyCall = () => ({
  peers: {},
  lobby: {},
  admitted: [],
  ...freshSession(),
});

function freshSession() {
  return {
    cohosts: [],
    removed: [],
    locked: false,
    allowed: [],
    permissions: { ...DEFAULT_PERMISSIONS },
    spotlight: null,
    recording: null,
    transcribing: null,
    breakouts: null,
    boardOpen: false,
  };
}

const callKey = (meetingId) => `call:${meetingId}`;
const isIdle = (call) => !Object.keys(call.peers).length && !Object.keys(call.lobby).length;

export const readCall = (meetingId) => shared.get(callKey(meetingId));

/** Changes a call under its lock; `change(call)` edits it in place and returns what the caller needs afterwards. */
export function mutate(meetingId, change) {
  const key = callKey(meetingId);
  return shared.withLock(key, async () => {
    const call = (await shared.get(key)) ?? emptyCall();
    const result = await change(call);
    if (isIdle(call)) await shared.del(key);
    else await shared.set(key, call, CALL_TTL_SECONDS);
    return result;
  });
}

/** Host and admins outrank co-hosts, who outrank everyone else; people can only moderate those ranked below them. */
const RANKS = { host: 2, admin: 2, cohost: 1 };
const rank = (peer) => RANKS[peer.role] ?? 0;
const isOwner = (peer) => rank(peer) === 2;
const add = (list, value) => (list.includes(value) ? list : list.push(value));
const without = (list, value) => list.filter((item) => item !== value);

const emptyListeners = new Set();
/** Runs when a call empties or is closed, e.g. to save the whiteboard. */
export const onCallEmptied = (listener) => emptyListeners.add(listener);
const callEmptied = (meetingId) => emptyListeners.forEach((listener) => listener(meetingId));

const meetingChannel = (meetingId) => `meeting:${meetingId}`;
const roomChannel = (meetingId, room) => `call:${meetingId}:${room ?? 'main'}`;
const admitChannel = (meetingId) => `admit:${meetingId}`;
const allChannels = (meetingId, call) => [
  meetingChannel(meetingId),
  admitChannel(meetingId),
  roomChannel(meetingId, null),
  ...(call?.breakouts?.rooms ?? []).map((room) => roomChannel(meetingId, room.id)),
];

/** Who is in these calls now: signed-in people (by user id) and how many guests. */
export async function callPresence(meetingIds) {
  const calls = await shared.getMany(meetingIds.map(callKey));
  return new Map(
    meetingIds.map((id, index) => {
      const peers = Object.values(calls[index]?.peers ?? {});
      return [id, { inCall: [...new Set(peers.filter((peer) => !peer.guest).map((peer) => peer.user.id))], guests: peers.filter((peer) => peer.guest).length }];
    }),
  );
}

/** The call this socket is in, and its place there (a snapshot: change it with `mutate`). */
export async function currentCall(socket) {
  const meetingId = socket.data.meetingId;
  if (!meetingId) return null;
  const call = await readCall(meetingId);
  const peer = call?.peers[socket.id];
  if (!peer) {
    socket.data.meetingId = null;
    return null;
  }
  return { meetingId, call, peer };
}

const publicPeer = ({ socketId, user, media, hand, room, role, guest }) => ({ socketId, user, media, hand, room, role, guest });
const mates = (call, peer) => Object.values(call.peers).filter((other) => other.room === peer.room && other.socketId !== peer.socketId).map(publicPeer);
const roomName = (call, room) => (room ? (call.breakouts?.rooms.find((item) => item.id === room)?.name ?? null) : null);
const recordingView = (call) => (call.recording ? { by: call.recording.by, since: call.recording.since } : null);
const sessionView = (call) => ({
  locked: call.locked,
  permissions: call.permissions,
  spotlight: call.spotlight,
  recording: recordingView(call),
  transcribing: call.transcribing,
  boardOpen: call.boardOpen,
});

function breakoutView(call) {
  if (!call.breakouts) return null;
  const people = (room) => Object.values(call.peers).filter((peer) => peer.room === room).map((peer) => ({ socketId: peer.socketId, user: peer.user }));
  return { rooms: call.breakouts.rooms.map((room) => ({ ...room, people: people(room.id) })), main: people(null) };
}

const lobbyView = (call) => Object.values(call.lobby).map(({ socketId, user, since }) => ({ socketId, user, since }));
const announceLobby = (io, meetingId, call) => io.to(admitChannel(meetingId)).emit('meeting:lobby', lobbyView(call));
const announceBreakouts = (io, meetingId, call) => io.to(meetingChannel(meetingId)).emit('meeting:breakouts', breakoutView(call));

const chatView = (row) => ({ id: row.id, at: row.createdAt, author: row.author, body: row.body, room: row.room, broadcast: row.broadcast });

/** The recent chat of a room (null: the main room); host messages to every room show everywhere. */
async function chatHistory(meetingId, room) {
  const rows = await MeetingChatMessage.findAll({
    where: { meetingId, [Op.or]: [{ room: room ?? null }, { broadcast: true }] },
    order: [['createdAt', 'DESC']],
    limit: CHAT_HISTORY,
  });
  return rows.reverse().map((row) => ({ ...chatView(row), room: room ?? null }));
}

/**
 * After people changed rooms: sockets switch channels, and everyone gets the people now in their room (and those who
 * moved, the room's chat and, with a media server, a pass for its media room).
 */
async function regroup(io, meetingId, call, before) {
  const histories = new Map();
  const historyFor = async (room) => {
    const key = room ?? 'main';
    if (!histories.has(key)) histories.set(key, await chatHistory(meetingId, room));
    return histories.get(key);
  };
  for (const peer of Object.values(call.peers)) {
    const previous = before[peer.socketId] ?? null;
    if (previous === peer.room) continue;
    io.in(peer.socketId).socketsLeave(roomChannel(meetingId, previous));
    io.in(peer.socketId).socketsJoin(roomChannel(meetingId, peer.room));
  }
  for (const peer of Object.values(call.peers)) {
    const moved = (before[peer.socketId] ?? null) !== peer.room;
    io.to(peer.socketId).emit('meeting:moved', {
      room: peer.room,
      roomName: roomName(call, peer.room),
      peers: mates(call, peer),
      chat: moved ? await historyFor(peer.room) : undefined,
      media: moved && sfuEnabled() ? await mediaFor(meetingId, peer.room, peer, call.permissions) : undefined,
    });
  }
  announceBreakouts(io, meetingId, call);
}
const roomsNow = (call) => Object.fromEntries(Object.values(call.peers).map((peer) => [peer.socketId, peer.room]));

const endsAt = (meeting) => new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000);

function assertOpen(meeting) {
  if (!meeting) throw new Error('Meeting not found');
  if (meeting.status === 'cancelled') throw new Error('This meeting was cancelled');
  if (meeting.status === 'ended') throw new Error('This meeting has ended');
  if (meeting.status === 'scheduled' && endsAt(meeting) <= new Date()) throw new Error('This meeting’s time is over. Schedule a new one to meet again.');
}

async function assertPlan(meeting) {
  const organization = await Organization.findByPk(meeting.organizationId, { include: withPlan() });
  if (!organization || !entitlementsFor(organization).features.meetings) throw new Error('This organization’s plan does not include meetings');
}

/** Host, invited people and the organization's admins may join while the meeting is not over and the plan allows it. */
async function memberJoin(meetingId, userId) {
  const meeting = await Meeting.findByPk(meetingId);
  assertOpen(meeting);
  const membership = await OrganizationMember.findOne({ where: { organizationId: meeting.organizationId, userId, status: 'active' } });
  if (!membership) throw new Error('You are not a member of this organization');
  await assertPlan(meeting);
  const invited = meeting.hostId === userId || (await MeetingParticipant.count({ where: { meetingId, userId } }));
  if (!invited && membership.role !== 'admin') throw new Error('You are not invited to this meeting');

  const user = await User.findByPk(userId, { attributes: USER_SUMMARY_ATTRIBUTES });
  return { meeting, user: user.toJSON(), role: meeting.hostId === userId ? 'host' : membership.role === 'admin' ? 'admin' : null };
}

const guestColor = (id) => GUEST_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % GUEST_COLORS.length];

/** Guests come with a pass for one meeting, which only works while its guest link is on. */
async function guestJoin(meetingId, guest) {
  if (guest.meetingId !== meetingId) throw new Error('This guest pass is for another meeting');
  const meeting = await Meeting.findByPk(meetingId);
  assertOpen(meeting);
  if (!meeting.guestToken) throw new Error('The host turned off guest access for this meeting');
  await assertPlan(meeting);
  return { meeting, user: { id: guest.id, name: guest.name, email: '', avatarColor: guestColor(guest.id), avatarUrl: null, title: 'Guest' }, role: null };
}

/** Marks the meeting live; returns true when this join started the call. */
async function recordJoin(meeting, userId) {
  let started = false;
  if (meeting.status === 'scheduled') {
    await meeting.update({ status: 'live', startedAt: meeting.startedAt ?? new Date() });
    started = true;
  }
  await MeetingParticipant.update({ joinedAt: new Date() }, { where: { meetingId: meeting.id, userId, joinedAt: null } });
  return started;
}

/** Whether starting the call now should ring the others (not when someone opens it long before its time). */
export const ringsNow = (meeting, now = Date.now()) => now >= new Date(meeting.startsAt).getTime() - RING_EARLY_MS;

/** Tells everyone invited who is in the call now, so meeting lists show "Live · 3 in the call" without reloading. */
async function announce(io, meetingId) {
  try {
    const meeting = await Meeting.findByPk(meetingId, { attributes: ['id', 'hostId', 'status'] });
    if (!meeting) return;
    const participants = await MeetingParticipant.findAll({ where: { meetingId }, attributes: ['userId'] });
    const people = new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean));
    const payload = { id: meeting.id, status: meeting.status, inCall: (await callPresence([meetingId])).get(meetingId).inCall };
    for (const userId of people) io.to(`user:${userId}`).emit('meeting:changed', payload);
  } catch {
    // Lists catch up on their next load.
  }
}

/**
 * Once everyone has left: a meeting whose time is over ends; one left early goes back to scheduled, so it does not
 * show as live and people can still join at the planned time.
 */
async function settleEmptyMeeting(meeting) {
  if (meeting.status !== 'live') return false;
  const call = await readCall(meeting.id);
  if (Object.keys(call?.peers ?? {}).length) return false;
  if (endsAt(meeting) <= new Date()) await meeting.update({ status: 'ended', endedAt: new Date() });
  else await meeting.update({ status: 'scheduled' });
  return true;
}

/** Takes a person out of a call (they left, were removed, or their connection is gone) and tells the others. */
async function evict(io, meetingId, socketId) {
  const result = await mutate(meetingId, (call) => {
    const peer = call.peers[socketId];
    if (!peer) return null;
    delete call.peers[socketId];
    const outcome = { peer, spotlightCleared: call.spotlight === socketId, recordingStopped: call.recording?.socketId === socketId, empty: false };
    if (outcome.spotlightCleared) call.spotlight = null;
    if (outcome.recordingStopped) call.recording = null;
    if (!Object.keys(call.peers).length) {
      Object.assign(call, freshSession());
      call.admitted = [];
      outcome.empty = true;
    }
    outcome.call = call;
    return outcome;
  });
  if (!result) return;
  const { peer, call } = result;
  io.in(socketId).socketsLeave([meetingChannel(meetingId), admitChannel(meetingId), roomChannel(meetingId, peer.room)]);
  io.to(roomChannel(meetingId, peer.room)).emit('meeting:peer-left', { socketId });
  if (result.spotlightCleared) io.to(meetingChannel(meetingId)).emit('meeting:spotlight', { socketId: null });
  if (result.recordingStopped) io.to(meetingChannel(meetingId)).emit('meeting:recording', { recording: null });
  if (call.breakouts) announceBreakouts(io, meetingId, call);
  if (result.empty) {
    callEmptied(meetingId);
    const meeting = await Meeting.findByPk(meetingId).catch(() => null);
    if (meeting) await settleEmptyMeeting(meeting).catch(() => undefined);
  }
  await announce(io, meetingId);
}

async function leave(io, socket) {
  const waitingIn = socket.data.lobbyMeetingId;
  if (waitingIn) {
    socket.data.lobbyMeetingId = null;
    const call = await mutate(waitingIn, (current) => {
      if (!current.lobby[socket.id]) return null;
      delete current.lobby[socket.id];
      return current;
    });
    if (call) announceLobby(io, waitingIn, call);
  }
  const meetingId = socket.data.meetingId;
  if (!meetingId) return;
  socket.data.meetingId = null;
  await evict(io, meetingId, socket.id);
}

/**
 * Forgets people whose connection is gone without a goodbye (a crashed server, a dropped network): only sockets that
 * still exist on some server stay in the call and the lobby.
 */
async function prune(io, meetingId) {
  const call = await readCall(meetingId);
  if (!call) return;
  const ids = [...Object.keys(call.peers), ...Object.keys(call.lobby)];
  if (!ids.length) return;
  let live;
  try {
    live = new Set((await io.in(ids).fetchSockets()).map((socket) => socket.id));
  } catch {
    return;
  }
  for (const socketId of Object.keys(call.peers)) if (!live.has(socketId)) await evict(io, meetingId, socketId);
  const gone = Object.keys(call.lobby).filter((socketId) => !live.has(socketId));
  if (gone.length) {
    const after = await mutate(meetingId, (current) => {
      gone.forEach((socketId) => delete current.lobby[socketId]);
      return current;
    });
    announceLobby(io, meetingId, after);
  }
}

let ioRef = null;
export const getIo = () => ioRef;

/** The host ended or cancelled the meeting: everyone in it, and everyone waiting, is sent out. */
export async function closeCall(meetingId, reason) {
  if (!ioRef) return;
  const before = await mutate(meetingId, (call) => {
    const snapshot = structuredClone(call);
    call.peers = {};
    call.lobby = {};
    return snapshot;
  });
  const sockets = [...Object.keys(before.peers), ...Object.keys(before.lobby)];
  if (!sockets.length) return;
  for (const socketId of sockets) ioRef.to(socketId).emit('meeting:closed', { meetingId, reason });
  ioRef.in(sockets).socketsLeave(allChannels(meetingId, before));
  if (Object.keys(before.peers).length) callEmptied(meetingId);
}

/** Guest access was turned off: guests still waiting are sent away (those already in the call stay). */
export async function dismissLobby(meetingId) {
  if (!ioRef) return;
  const call = await mutate(meetingId, (current) => {
    const waiting = Object.keys(current.lobby);
    current.lobby = {};
    current.admitted = [];
    return { ...current, waiting };
  });
  for (const socketId of call.waiting) ioRef.to(socketId).emit('meeting:denied', { reason: 'guests-off' });
  announceLobby(ioRef, meetingId, call);
}

/** Background check for meetings left "live" with nobody in them (e.g. after a server restart). */
export async function settleIdleMeetings() {
  const live = await Meeting.findAll({ where: { status: 'live' } });
  /** Calls that happened, emptied early, and whose planned time is now over. */
  const finished = await Meeting.findAll({ where: { status: 'scheduled', startedAt: { [Op.ne]: null }, startsAt: { [Op.lte]: new Date() } } });
  let settled = 0;
  for (const meeting of live) {
    if (ioRef) await prune(ioRef, meeting.id);
    if (await settleEmptyMeeting(meeting)) {
      settled += 1;
      if (ioRef) await announce(ioRef, meeting.id);
    }
  }
  const presence = await callPresence(finished.map((meeting) => meeting.id));
  for (const meeting of finished) {
    if (endsAt(meeting) > new Date() || presence.get(meeting.id).inCall.length || presence.get(meeting.id).guests) continue;
    await meeting.update({ status: 'ended', endedAt: endsAt(meeting) });
    settled += 1;
    if (ioRef) await announce(ioRef, meeting.id);
  }
  // Recordings whose upload never came (the browser closed while recording).
  await MeetingRecording.update({ status: 'failed' }, { where: { status: 'recording', startedAt: { [Op.lt]: new Date(Date.now() - 12 * 60 * 60_000) } } });
  return settled;
}

function allow(socket, key, burst) {
  const now = Date.now();
  const recent = (socket.data[key] ?? []).filter((time) => now - time < burst.perMs);
  if (recent.length >= burst.messages) return false;
  socket.data[key] = [...recent, now];
  return true;
}

/** Whether `actor` may act on `target` in `call`: `{ actor, target }`, or `{ error }`. */
function moderation(call, actorId, targetId) {
  const actor = call.peers[actorId];
  if (!actor?.canManage) return { error: 'Only the host or a co-host can do that' };
  const target = call.peers[targetId];
  if (!target || target === actor) return { error: 'That person is no longer in the call' };
  if (rank(target) >= rank(actor)) return { error: `You cannot do that to ${target.user.name}` };
  return { actor, target };
}

/** Turns someone's microphone off in the call state; returns whether it was on. */
function silence(peer) {
  if (!peer.media.audio) return false;
  peer.media = { ...peer.media, audio: false };
  return true;
}

function tellMuted(io, meetingId, peer, by) {
  io.to(peer.socketId).emit('meeting:muted', { by });
  io.to(roomChannel(meetingId, peer.room)).except(peer.socketId).emit('meeting:peer-media', { socketId: peer.socketId, media: peer.media });
}

function tellStopShare(io, meetingId, peer, by) {
  io.to(peer.socketId).emit('meeting:stop-share', { by });
  io.to(roomChannel(meetingId, peer.room)).except(peer.socketId).emit('meeting:peer-media', { socketId: peer.socketId, media: peer.media });
}

const fail = (ack, error) => ack?.({ ok: false, error });

export function registerMeetingSignaling(io, socket) {
  ioRef = io;

  socket.on('meeting:join', async ({ meetingId, media } = {}, ack) => {
    try {
      const guest = socket.data.guest;
      const joined = guest ? await guestJoin(meetingId, guest) : await memberJoin(meetingId, socket.data.userId);
      const { meeting, user } = joined;
      if (socket.data.meetingId || socket.data.lobbyMeetingId) await leave(io, socket);
      await prune(io, meetingId);

      const outcome = await mutate(meetingId, (call) => {
        const role = joined.role ?? (call.cohosts.includes(user.id) ? 'cohost' : null);
        if (call.removed.includes(user.id)) return { error: 'The host removed you from this call.' };
        if (call.locked && RANKS[role] !== 2 && !call.allowed.includes(user.id)) return { error: 'The host locked this call, so nobody new can join right now.' };
        if (guest && !call.admitted.includes(guest.id)) {
          call.lobby[socket.id] = { socketId: socket.id, user, since: new Date().toISOString() };
          return { waiting: true, call, alone: !Object.values(call.peers).some((peer) => !peer.guest) };
        }
        if (Object.keys(call.peers).length >= callCapacity()) return { error: `This call is full (${callCapacity()} people). Try again when someone leaves.` };
        const canManage = Boolean(role);
        const self = {
          socketId: socket.id,
          user,
          media: { audio: Boolean(media?.audio) && (canManage || call.permissions.unmute), video: Boolean(media?.video), screen: false },
          hand: null,
          room: null,
          role,
          canManage,
          guest: Boolean(guest),
        };
        const peers = mates(call, self);
        call.peers[socket.id] = self;
        return { self, peers, call };
      });

      if (outcome.error) return fail(ack, outcome.error);
      if (outcome.waiting) {
        socket.data.lobbyMeetingId = meetingId;
        announceLobby(io, meetingId, outcome.call);
        if (outcome.alone) void knockHost(io, meeting, user.name).catch(() => undefined);
        return ack?.({ ok: false, waiting: true });
      }

      const { self, peers, call } = outcome;
      socket.join([meetingChannel(meetingId), roomChannel(meetingId, null), ...(guest ? [] : [admitChannel(meetingId)])]);
      socket.data.meetingId = meetingId;
      socket.to(roomChannel(meetingId, null)).emit('meeting:peer-joined', publicPeer(self));
      const started = guest ? false : await recordJoin(meeting, user.id);
      ack?.({
        ok: true,
        selfId: socket.id,
        canManage: self.canManage,
        role: self.role,
        ...sessionView(call),
        peers,
        chat: await chatHistory(meetingId, null),
        breakouts: breakoutView(call),
        lobby: guest ? [] : lobbyView(call),
        reactions: REACTIONS,
        media: await mediaFor(meetingId, null, self, call.permissions),
        capacity: callCapacity(),
      });
      if (call.breakouts) announceBreakouts(io, meetingId, call);
      void announce(io, meetingId);
      if (started && ringsNow(meeting)) {
        const present = (await callPresence([meetingId])).get(meetingId).inCall;
        void ringInvitees(io, meeting, user, present).catch((error) => console.warn('[meetings] ringing failed:', error.message));
      }
    } catch (error) {
      fail(ack, error.message);
    }
  });

  /** Connection offers, answers and network candidates, passed only between people in the same room of a call. */
  socket.on('meeting:signal', async ({ to, data } = {}) => {
    const here = await currentCall(socket);
    const target = here?.call.peers[to];
    if (!target || target.room !== here.peer.room) return;
    io.to(to).emit('meeting:signal', { from: socket.id, data });
  });

  /** What this person sends now; what the host does not allow is refused (and they are asked to stop). */
  socket.on('meeting:media', async (media = {}) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return;
    const result = await mutate(meetingId, (call) => {
      const peer = call.peers[socket.id];
      if (!peer) return null;
      const refused = { audio: false, screen: false };
      let audio = Boolean(media.audio);
      let screen = Boolean(media.screen);
      if (!peer.canManage && audio && !call.permissions.unmute) [audio, refused.audio] = [false, true];
      if (!peer.canManage && screen && !call.permissions.share) [screen, refused.screen] = [false, true];
      peer.media = { audio, video: Boolean(media.video), screen };
      return { peer, refused };
    });
    if (!result) return;
    const { peer, refused } = result;
    if (refused.audio) io.to(socket.id).emit('meeting:muted', { by: null, reason: 'unmute-off' });
    if (refused.screen) io.to(socket.id).emit('meeting:stop-share', { by: null, reason: 'share-off' });
    socket.to(roomChannel(meetingId, peer.room)).emit('meeting:peer-media', { socketId: socket.id, media: peer.media });
  });

  /** Raises or lowers your own hand; the host can lower anyone's. */
  socket.on('meeting:hand', async ({ raised, socketId } = {}) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return;
    const target = await mutate(meetingId, (call) => {
      const self = call.peers[socket.id];
      if (!self) return null;
      const peer = !socketId || socketId === socket.id ? self : self.canManage ? call.peers[socketId] : null;
      if (!peer || (peer !== self && raised)) return null;
      peer.hand = raised ? Date.now() : null;
      return peer;
    });
    if (target) io.to(roomChannel(meetingId, target.room)).emit('meeting:peer-hand', { socketId: target.socketId, hand: target.hand });
  });

  socket.on('meeting:reaction', async ({ emoji } = {}) => {
    if (!REACTIONS.includes(emoji)) return;
    const now = Date.now();
    if (now - (socket.data.lastReactionAt ?? 0) < 250) return;
    socket.data.lastReactionAt = now;
    const here = await currentCall(socket);
    if (here) io.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:reaction', { socketId: socket.id, emoji });
  });

  /** Chat for the people in the same room; it is kept with the meeting. */
  socket.on('meeting:chat', async ({ body } = {}, ack) => {
    const here = await currentCall(socket);
    const text = typeof body === 'string' ? body.trim().slice(0, 1000) : '';
    if (!here || !text) return fail(ack, 'Write a message first');
    if (!here.peer.canManage && !here.call.permissions.chat) return fail(ack, 'The host turned chat off for now.');
    if (!allow(socket, 'chatTimes', CHAT_BURST)) return fail(ack, 'You are sending messages too quickly. Wait a moment.');
    const row = await MeetingChatMessage.create({
      meetingId: here.meetingId,
      author: here.peer.user,
      room: here.peer.room,
      roomName: roomName(here.call, here.peer.room),
      body: text,
    });
    io.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:chat', chatView(row));
    ack?.({ ok: true });
  });

  /** Anyone signed in who is in the call can let a waiting guest in, or turn them away. */
  socket.on('meeting:admit', async ({ socketId, allow: letIn } = {}) => {
    const here = await currentCall(socket);
    if (!here || here.peer.guest) return;
    const result = await mutate(here.meetingId, (call) => {
      const waiting = call.lobby[socketId];
      if (!waiting) return null;
      delete call.lobby[socketId];
      if (letIn) add(call.admitted, waiting.user.id);
      return call;
    });
    if (!result) return;
    io.to(socketId).emit(letIn ? 'meeting:admitted' : 'meeting:denied', { by: here.peer.user.name });
    announceLobby(io, here.meetingId, result);
  });

  /** The host splits the call: `rooms` is [{ name, socketIds }]; anyone not listed stays in the main room. */
  socket.on('meeting:breakouts:open', async ({ rooms } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!Array.isArray(rooms) || rooms.length < 2 || rooms.length > MAX_BREAKOUT_ROOMS) return fail(ack, `Choose between 2 and ${MAX_BREAKOUT_ROOMS} rooms`);
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      if (!call.peers[socket.id]?.canManage) return { error: 'Only the host can open breakout rooms' };
      const before = roomsNow(call);
      call.breakouts = { rooms: rooms.map((room, index) => ({ id: `room-${index + 1}`, name: String(room?.name ?? '').trim().slice(0, 40) || `Room ${index + 1}` })) };
      for (const peer of Object.values(call.peers)) peer.room = null;
      rooms.forEach((room, index) => {
        for (const socketId of Array.isArray(room?.socketIds) ? room.socketIds : []) {
          if (call.peers[socketId]) call.peers[socketId].room = call.breakouts.rooms[index].id;
        }
      });
      return { call, before };
    });
    if (result.error) return fail(ack, result.error);
    await regroup(io, meetingId, result.call, result.before);
    ack?.({ ok: true });
  });

  /** Moves someone (the host may move anyone; people may move themselves) to a room, or back to the main room. */
  socket.on('meeting:breakouts:move', async ({ socketId, room } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const self = call.peers[socket.id];
      if (!self) return { error: 'You are not in the call' };
      if (!call.breakouts) return { error: 'Breakout rooms are closed' };
      const target = call.peers[socketId ?? socket.id];
      if (!target || (target !== self && !self.canManage)) return { error: 'Only the host can move other people' };
      const roomId = room ?? null;
      if (roomId && !call.breakouts.rooms.some((item) => item.id === roomId)) return { error: 'That room is closed' };
      const before = roomsNow(call);
      target.room = roomId;
      return { call, before };
    });
    if (result.error) return fail(ack, result.error);
    await regroup(io, meetingId, result.call, result.before);
    ack?.({ ok: true });
  });

  socket.on('meeting:breakouts:close', async (_payload, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      if (!call.peers[socket.id]?.canManage) return { error: 'Only the host can close breakout rooms' };
      const before = roomsNow(call);
      call.breakouts = null;
      for (const peer of Object.values(call.peers)) peer.room = null;
      return { call, before };
    });
    if (result.error) return fail(ack, result.error);
    await regroup(io, meetingId, result.call, result.before);
    ack?.({ ok: true });
  });

  /** A message from the host to every room at once. */
  socket.on('meeting:breakouts:broadcast', async ({ body } = {}, ack) => {
    const here = await currentCall(socket);
    const text = typeof body === 'string' ? body.trim().slice(0, 500) : '';
    if (!here?.peer.canManage || !here.call.breakouts || !text) return fail(ack, 'Write a message for the rooms');
    const row = await MeetingChatMessage.create({ meetingId: here.meetingId, author: here.peer.user, room: null, broadcast: true, body: text });
    io.to(meetingChannel(here.meetingId)).emit('meeting:chat', chatView(row));
    ack?.({ ok: true });
  });

  // --- Running the call ---------------------------------------------------------------------------------------------

  socket.on('meeting:mute', async ({ socketId } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const check = moderation(call, socket.id, socketId);
      if (check.error) return check;
      return { target: check.target, changed: silence(check.target), by: check.actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    tellMuted(io, meetingId, result.target, result.by);
    await sfuMuteMicrophone(meetingId, result.target);
    ack?.({ ok: true });
  });

  /** Mutes everyone ranked below the person asking, in every room. */
  socket.on('meeting:mute-all', async (_payload, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor?.canManage) return { error: 'Only the host or a co-host can do that' };
      const below = Object.values(call.peers).filter((peer) => rank(peer) < rank(actor));
      return { by: actor.user.name, below, muted: below.filter(silence) };
    });
    if (result.error) return fail(ack, result.error);
    for (const peer of result.muted) tellMuted(io, meetingId, peer, result.by);
    await Promise.all(result.below.map((peer) => sfuMuteMicrophone(meetingId, peer)));
    ack?.({ ok: true, muted: result.muted.length });
  });

  socket.on('meeting:stop-share', async ({ socketId } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const check = moderation(call, socket.id, socketId);
      if (check.error) return check;
      check.target.media = { ...check.target.media, screen: false };
      return { target: check.target, by: check.actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    tellStopShare(io, meetingId, result.target, result.by);
    await sfuStopScreen(meetingId, result.target);
    ack?.({ ok: true });
  });

  /** Sends someone (all their tabs) out of the call; they cannot come back until the call empties. */
  socket.on('meeting:remove', async ({ socketId } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const check = moderation(call, socket.id, socketId);
      if (check.error) return check;
      const userId = check.target.user.id;
      add(call.removed, userId);
      call.admitted = without(call.admitted, userId);
      call.allowed = without(call.allowed, userId);
      call.cohosts = without(call.cohosts, userId);
      return { by: check.actor.user.name, sockets: Object.values(call.peers).filter((peer) => peer.user.id === userId) };
    });
    if (result.error) return fail(ack, result.error);
    for (const peer of result.sockets) {
      io.to(peer.socketId).emit('meeting:removed', { meetingId, by: result.by });
      await sfuRemove(meetingId, peer);
      await evict(io, meetingId, peer.socketId);
    }
    ack?.({ ok: true });
  });

  /** Locks the call (nobody new comes in; guests still waiting are turned away) or opens it again. */
  socket.on('meeting:lock', async ({ locked } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor?.canManage) return { error: 'Only the host or a co-host can lock the call' };
      call.locked = Boolean(locked);
      call.allowed = call.locked ? [...new Set(Object.values(call.peers).map((peer) => peer.user.id))] : [];
      const turnedAway = call.locked ? Object.keys(call.lobby) : [];
      if (turnedAway.length) call.lobby = {};
      return { call, turnedAway, by: actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    for (const waitingId of result.turnedAway) io.to(waitingId).emit('meeting:denied', { reason: 'locked' });
    if (result.turnedAway.length) announceLobby(io, meetingId, result.call);
    socket.to(meetingChannel(meetingId)).emit('meeting:locked', { locked: result.call.locked, by: result.by });
    ack?.({ ok: true });
  });

  /** The host (or an admin) makes someone from the organization a co-host for this call, or takes it back. */
  socket.on('meeting:cohost', async ({ socketId, cohost } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor || !isOwner(actor)) return { error: 'Only the host can choose co-hosts' };
      const target = call.peers[socketId];
      if (!target || target === actor) return { error: 'That person is no longer in the call' };
      if (target.guest) return { error: 'Guests cannot be co-hosts' };
      if (isOwner(target)) return { error: `${target.user.name} already runs this meeting` };
      const role = cohost ? 'cohost' : null;
      call.cohosts = role ? [...new Set([...call.cohosts, target.user.id])] : without(call.cohosts, target.user.id);
      const changed = Object.values(call.peers).filter((peer) => peer.user.id === target.user.id);
      for (const peer of changed) Object.assign(peer, { role, canManage: Boolean(role) });
      return { changed, role, by: actor.user.name, permissions: call.permissions };
    });
    if (result.error) return fail(ack, result.error);
    for (const peer of result.changed) {
      io.to(peer.socketId).emit('meeting:role', { role: result.role, by: result.by });
      io.to(meetingChannel(meetingId)).except(peer.socketId).emit('meeting:peer-role', { socketId: peer.socketId, role: result.role });
      await sfuApplyPermissions(meetingId, peer, result.permissions);
    }
    ack?.({ ok: true });
  });

  /** What people who do not run the call may do: `{ chat, share, unmute }` (any of them). */
  socket.on('meeting:permissions', async (changes = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor?.canManage) return { error: 'Only the host or a co-host can change this' };
      for (const key of Object.keys(DEFAULT_PERMISSIONS)) if (typeof changes[key] === 'boolean') call.permissions[key] = changes[key];
      const others = Object.values(call.peers).filter((peer) => !peer.canManage);
      const stopped = call.permissions.share ? [] : others.filter((peer) => peer.media.screen);
      stopped.forEach((peer) => (peer.media = { ...peer.media, screen: false }));
      const muted = call.permissions.unmute ? [] : others.filter(silence);
      return { permissions: call.permissions, others, stopped, muted, by: actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    io.to(meetingChannel(meetingId)).emit('meeting:permissions', { permissions: result.permissions, by: result.by });
    for (const peer of result.stopped) tellStopShare(io, meetingId, peer, result.by);
    for (const peer of result.muted) tellMuted(io, meetingId, peer, result.by);
    if (sfuEnabled()) {
      await Promise.all(
        result.others.map(async (peer) => {
          await sfuApplyPermissions(meetingId, peer, result.permissions);
          if (!result.permissions.unmute) await sfuMuteMicrophone(meetingId, peer);
        }),
      );
    }
    ack?.({ ok: true });
  });

  /** Shows one person large for everyone (null: back to the usual layout). */
  socket.on('meeting:spotlight', async ({ socketId } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor?.canManage) return { error: 'Only the host or a co-host can spotlight someone' };
      call.spotlight = socketId && call.peers[socketId] ? socketId : null;
      return { spotlight: call.spotlight, by: actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    io.to(meetingChannel(meetingId)).emit('meeting:spotlight', { socketId: result.spotlight, by: result.by });
    ack?.({ ok: true });
  });

  /**
   * Starts or stops recording. The recording is made in the browser of the person who started it; everyone sees that
   * the call is being recorded. Starting returns the id the finished file is uploaded to.
   */
  socket.on('meeting:recording', async ({ on } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here?.peer.canManage || here.peer.guest) return fail(ack, 'Only the host or a co-host can record');
    const { meetingId, peer } = here;
    if (on) {
      if (here.call.recording) return fail(ack, `${here.call.recording.by} is already recording`);
      const recording = await MeetingRecording.create({ meetingId, createdById: peer.user.id, startedAt: new Date() });
      const result = await mutate(meetingId, (call) => {
        if (call.recording) return { error: `${call.recording.by} is already recording` };
        call.recording = { socketId: socket.id, userId: peer.user.id, by: peer.user.name, since: new Date().toISOString(), recordingId: recording.id };
        return { recording: recordingView(call) };
      });
      if (result.error) {
        await recording.destroy();
        return fail(ack, result.error);
      }
      io.to(meetingChannel(meetingId)).emit('meeting:recording', { recording: result.recording });
      return ack?.({ ok: true, recordingId: recording.id });
    }
    const stopped = await mutate(meetingId, (call) => {
      if (!call.recording) return false;
      call.recording = null;
      return true;
    });
    if (stopped) io.to(meetingChannel(meetingId)).emit('meeting:recording', { recording: null, by: peer.user.name });
    ack?.({ ok: true });
  });

  /** Turns live captions on for everyone: each browser that can transcribes its own microphone. */
  socket.on('meeting:transcribe', async ({ on } = {}, ack) => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return fail(ack, 'You are not in the call');
    const result = await mutate(meetingId, (call) => {
      const actor = call.peers[socket.id];
      if (!actor?.canManage) return { error: 'Only the host or a co-host can turn captions on' };
      call.transcribing = on ? { by: actor.user.name, since: new Date().toISOString() } : null;
      return { transcribing: call.transcribing, by: actor.user.name };
    });
    if (result.error) return fail(ack, result.error);
    io.to(meetingChannel(meetingId)).emit('meeting:transcribing', result);
    ack?.({ ok: true });
  });

  /** A piece of what someone said: shown as captions in their room; finished sentences go into the transcript. */
  socket.on('meeting:caption', async ({ id, text, final } = {}) => {
    const value = typeof text === 'string' ? text.trim().slice(0, 500) : '';
    if (!value || typeof id !== 'string' || id.length > 40 || !allow(socket, 'captionTimes', CAPTION_BURST)) return;
    const here = await currentCall(socket);
    if (!here?.call.transcribing) return;
    const speaker = { id: here.peer.user.id, name: here.peer.user.name, guest: here.peer.guest };
    io.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:caption', { id, socketId: socket.id, speaker, text: value, final: Boolean(final) });
    if (final) await MeetingTranscriptLine.create({ meetingId: here.meetingId, speaker, text: value, spokenAt: new Date() }).catch(() => undefined);
  });

  socket.on('meeting:leave', () => void leave(io, socket));
  socket.on('disconnect', () => void leave(io, socket));
}
