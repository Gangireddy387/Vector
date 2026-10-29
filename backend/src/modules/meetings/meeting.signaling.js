import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { Meeting, MeetingParticipant, Organization, OrganizationMember, User } from '../../database/models.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { knockHost, ringInvitees } from './meeting.ring.js';

/**
 * Video calls connect browsers directly to each other (WebRTC); the server only introduces them: it keeps who is in
 * each call and passes their connection offers along. Every browser links to every other one, so a call is
 * capped at a size that works well that way.
 *
 * Breakout rooms split a call: only people in the same room connect to each other. Guests (people outside the
 * organization with the meeting's guest link) wait in a lobby until someone in the call lets them in.
 */
export const MAX_CALL_SIZE = 8;
const MAX_BREAKOUT_ROOMS = 6;
export const REACTIONS = ['👍', '👏', '😂', '🎉', '❤️', '😮', '🙏', '🤔'];
const CHAT_HISTORY = 200;
const CHAT_BURST = { messages: 10, perMs: 10_000 };
const GUEST_COLORS = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#ef4444', '#6366f1'];

/**
 * meetingId → {
 *   peers: socketId → { socketId, user, media, hand, room, canManage, guest },
 *   lobby: socketId → { socketId, user, since }   (guests waiting to be let in),
 *   admitted: guest ids let in (kept across their reconnects),
 *   chat: room id ('main' or a breakout room) → recent messages,
 *   breakouts: null | { rooms: [{ id, name }] },
 * }
 */
const calls = new Map();
const emptyListeners = new Set();

function callFor(meetingId) {
  let call = calls.get(meetingId);
  if (!call) {
    call = { peers: new Map(), lobby: new Map(), admitted: new Set(), chat: new Map(), breakouts: null };
    calls.set(meetingId, call);
  }
  return call;
}

const meetingChannel = (meetingId) => `meeting:${meetingId}`;
const roomChannel = (meetingId, room) => `call:${meetingId}:${room ?? 'main'}`;
const admitChannel = (meetingId) => `admit:${meetingId}`;

/** Signed-in people in the call now (guests are not part of the organization, so they are counted apart). */
export const peopleInCall = (meetingId) => [...new Set([...(calls.get(meetingId)?.peers.values() ?? [])].filter((peer) => !peer.guest).map((peer) => peer.user.id))];
export const guestsInCall = (meetingId) => [...(calls.get(meetingId)?.peers.values() ?? [])].filter((peer) => peer.guest).length;

/** Runs when a call empties or is closed, e.g. to save the whiteboard. */
export const onCallEmptied = (listener) => emptyListeners.add(listener);

/** The call this socket is in, and its place there. */
export function currentCall(socket) {
  const meetingId = socket.data.meetingId;
  const call = meetingId ? calls.get(meetingId) : null;
  const peer = call?.peers.get(socket.id);
  return peer ? { meetingId, call, peer } : null;
}

const publicPeer = ({ socketId, user, media, hand, room, guest }) => ({ socketId, user, media, hand, room, guest });
const mates = (call, peer) => [...call.peers.values()].filter((other) => other.room === peer.room && other.socketId !== peer.socketId).map(publicPeer);
const chatFor = (call, room) => call.chat.get(room ?? 'main') ?? [];
const roomName = (call, room) => (room ? (call.breakouts?.rooms.find((item) => item.id === room)?.name ?? null) : null);

function remember(call, room, message) {
  const log = call.chat.get(room ?? 'main') ?? [];
  log.push(message);
  if (log.length > CHAT_HISTORY) log.splice(0, log.length - CHAT_HISTORY);
  call.chat.set(room ?? 'main', log);
}

function breakoutView(call) {
  if (!call.breakouts) return null;
  const people = (room) => [...call.peers.values()].filter((peer) => peer.room === room).map((peer) => ({ socketId: peer.socketId, user: peer.user }));
  return { rooms: call.breakouts.rooms.map((room) => ({ ...room, people: people(room.id) })), main: people(null) };
}

const lobbyView = (call) => [...call.lobby.values()].map(({ socketId, user, since }) => ({ socketId, user, since }));
const announceLobby = (io, meetingId, call) => io.to(admitChannel(meetingId)).emit('meeting:lobby', lobbyView(call));
const announceBreakouts = (io, meetingId, call) => io.to(meetingChannel(meetingId)).emit('meeting:breakouts', breakoutView(call));

/**
 * After people changed rooms: sockets switch channels, and everyone gets the list of people now in their room. Each
 * browser keeps its connections to people still with it and connects to the new ones.
 */
function regroup(io, meetingId, call, before) {
  for (const peer of call.peers.values()) {
    const previous = before.get(peer.socketId) ?? null;
    if (previous === peer.room) continue;
    const socket = io.sockets.sockets.get(peer.socketId);
    socket?.leave(roomChannel(meetingId, previous));
    socket?.join(roomChannel(meetingId, peer.room));
  }
  for (const peer of call.peers.values()) {
    io.to(peer.socketId).emit('meeting:moved', { room: peer.room, roomName: roomName(call, peer.room), peers: mates(call, peer), chat: chatFor(call, peer.room) });
  }
  announceBreakouts(io, meetingId, call);
}
const roomsNow = (call) => new Map([...call.peers.values()].map((peer) => [peer.socketId, peer.room]));

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
  return { meeting, user: user.toJSON(), canManage: meeting.hostId === userId || membership.role === 'admin' };
}

const guestColor = (id) => GUEST_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % GUEST_COLORS.length];

/** Guests come with a pass for one meeting, which only works while its guest link is on. */
async function guestJoin(meetingId, guest) {
  if (guest.meetingId !== meetingId) throw new Error('This guest pass is for another meeting');
  const meeting = await Meeting.findByPk(meetingId);
  assertOpen(meeting);
  if (!meeting.guestToken) throw new Error('The host turned off guest access for this meeting');
  await assertPlan(meeting);
  return { meeting, user: { id: guest.id, name: guest.name, email: '', avatarColor: guestColor(guest.id), avatarUrl: null, title: 'Guest' }, canManage: false };
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

/** Tells everyone invited who is in the call now, so meeting lists show "Live · 3 in the call" without reloading. */
async function announce(io, meetingId) {
  try {
    const meeting = await Meeting.findByPk(meetingId, { attributes: ['id', 'hostId', 'status'] });
    if (!meeting) return;
    const participants = await MeetingParticipant.findAll({ where: { meetingId }, attributes: ['userId'] });
    const people = new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean));
    const payload = { id: meeting.id, status: meeting.status, inCall: peopleInCall(meetingId) };
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
  if (meeting.status !== 'live' || calls.get(meeting.id)?.peers.size) return false;
  if (endsAt(meeting) <= new Date()) await meeting.update({ status: 'ended', endedAt: new Date() });
  else await meeting.update({ status: 'scheduled' });
  return true;
}

function emptied(meetingId, call) {
  call.chat.clear();
  call.breakouts = null;
  call.admitted.clear();
  if (!call.lobby.size) calls.delete(meetingId);
  for (const listener of emptyListeners) listener(meetingId);
}

async function leave(io, socket) {
  const waitingIn = socket.data.lobbyMeetingId;
  if (waitingIn) {
    socket.data.lobbyMeetingId = null;
    const call = calls.get(waitingIn);
    if (call?.lobby.delete(socket.id)) {
      announceLobby(io, waitingIn, call);
      if (!call.peers.size && !call.lobby.size) calls.delete(waitingIn);
    }
  }

  const meetingId = socket.data.meetingId;
  if (!meetingId) return;
  socket.data.meetingId = null;
  const call = calls.get(meetingId);
  const peer = call?.peers.get(socket.id);
  socket.leave(meetingChannel(meetingId));
  socket.leave(admitChannel(meetingId));
  socket.leave(roomChannel(meetingId, peer?.room ?? null));
  if (call && peer) {
    call.peers.delete(socket.id);
    io.to(roomChannel(meetingId, peer.room)).emit('meeting:peer-left', { socketId: socket.id });
    if (call.breakouts) announceBreakouts(io, meetingId, call);
  }
  if (call && !call.peers.size) {
    emptied(meetingId, call);
    const meeting = await Meeting.findByPk(meetingId).catch(() => null);
    if (meeting) await settleEmptyMeeting(meeting).catch(() => undefined);
  }
  await announce(io, meetingId);
}

let ioRef = null;

/** The host ended or cancelled the meeting: everyone in it, and everyone waiting, is sent out. */
export function closeCall(meetingId, reason) {
  const call = calls.get(meetingId);
  if (!call || !ioRef) return;
  const sockets = [...call.peers.keys(), ...call.lobby.keys()];
  for (const socketId of sockets) {
    ioRef.to(socketId).emit('meeting:closed', { meetingId, reason });
    const socket = ioRef.sockets.sockets.get(socketId);
    if (!socket) continue;
    for (const channel of [...socket.rooms]) {
      if (channel === meetingChannel(meetingId) || channel === admitChannel(meetingId) || channel.startsWith(`call:${meetingId}:`)) socket.leave(channel);
    }
    socket.data.meetingId = null;
    socket.data.lobbyMeetingId = null;
  }
  call.peers.clear();
  call.lobby.clear();
  emptied(meetingId, call);
}

/** Guest access was turned off: guests still waiting are sent away (those already in the call stay). */
export function dismissLobby(meetingId) {
  const call = calls.get(meetingId);
  if (!call || !ioRef) return;
  for (const socketId of call.lobby.keys()) {
    ioRef.to(socketId).emit('meeting:denied', { reason: 'guests-off' });
    const socket = ioRef.sockets.sockets.get(socketId);
    if (socket) socket.data.lobbyMeetingId = null;
  }
  call.lobby.clear();
  call.admitted.clear();
  announceLobby(ioRef, meetingId, call);
  if (!call.peers.size) calls.delete(meetingId);
}

/** Background check for meetings left "live" with nobody in them (e.g. after a server restart). */
export async function settleIdleMeetings() {
  const live = await Meeting.findAll({ where: { status: 'live' } });
  /** Calls that happened, emptied early, and whose planned time is now over. */
  const finished = await Meeting.findAll({ where: { status: 'scheduled', startedAt: { [Op.ne]: null }, startsAt: { [Op.lte]: new Date() } } });
  let settled = 0;
  for (const meeting of live) {
    if (await settleEmptyMeeting(meeting)) {
      settled += 1;
      if (ioRef) await announce(ioRef, meeting.id);
    }
  }
  for (const meeting of finished) {
    if (endsAt(meeting) > new Date() || calls.get(meeting.id)?.peers.size) continue;
    await meeting.update({ status: 'ended', endedAt: endsAt(meeting) });
    settled += 1;
    if (ioRef) await announce(ioRef, meeting.id);
  }
  return settled;
}

function allowChat(socket) {
  const now = Date.now();
  const recent = (socket.data.chatTimes ?? []).filter((time) => now - time < CHAT_BURST.perMs);
  if (recent.length >= CHAT_BURST.messages) return false;
  socket.data.chatTimes = [...recent, now];
  return true;
}

export function registerMeetingSignaling(io, socket) {
  ioRef = io;

  socket.on('meeting:join', async ({ meetingId, media } = {}, ack) => {
    try {
      const guest = socket.data.guest;
      const { meeting, user, canManage } = guest ? await guestJoin(meetingId, guest) : await memberJoin(meetingId, socket.data.userId);
      if (socket.data.meetingId || socket.data.lobbyMeetingId) await leave(io, socket);
      const call = callFor(meetingId);

      if (guest && !call.admitted.has(guest.id)) {
        call.lobby.set(socket.id, { socketId: socket.id, user, since: new Date().toISOString() });
        socket.data.lobbyMeetingId = meetingId;
        announceLobby(io, meetingId, call);
        const someoneCanAdmit = [...call.peers.values()].some((peer) => !peer.guest);
        if (!someoneCanAdmit) void knockHost(io, meeting, user.name).catch(() => undefined);
        return ack?.({ ok: false, waiting: true });
      }
      if (call.peers.size >= MAX_CALL_SIZE) {
        if (!call.peers.size && !call.lobby.size) calls.delete(meetingId);
        return ack?.({ ok: false, error: `This call is full (${MAX_CALL_SIZE} people). Try again when someone leaves.` });
      }

      const self = {
        socketId: socket.id,
        user,
        media: { audio: Boolean(media?.audio), video: Boolean(media?.video), screen: false },
        hand: null,
        room: null,
        canManage,
        guest: Boolean(guest),
      };
      const peers = mates(call, self);
      call.peers.set(socket.id, self);
      socket.join(meetingChannel(meetingId));
      socket.join(roomChannel(meetingId, null));
      if (!guest) socket.join(admitChannel(meetingId));
      socket.data.meetingId = meetingId;
      socket.to(roomChannel(meetingId, null)).emit('meeting:peer-joined', publicPeer(self));
      const started = guest ? false : await recordJoin(meeting, user.id);
      ack?.({
        ok: true,
        selfId: socket.id,
        canManage,
        peers,
        chat: chatFor(call, null),
        breakouts: breakoutView(call),
        lobby: guest ? [] : lobbyView(call),
        reactions: REACTIONS,
      });
      if (call.breakouts) announceBreakouts(io, meetingId, call);
      void announce(io, meetingId);
      if (started) void ringInvitees(io, meeting, user, peopleInCall(meetingId)).catch((error) => console.warn('[meetings] ringing failed:', error.message));
    } catch (error) {
      ack?.({ ok: false, error: error.message });
    }
  });

  /** Connection offers, answers and network candidates, passed only between people in the same room of a call. */
  socket.on('meeting:signal', ({ to, data } = {}) => {
    const here = currentCall(socket);
    const target = here?.call.peers.get(to);
    if (!target || target.room !== here.peer.room) return;
    io.to(to).emit('meeting:signal', { from: socket.id, data });
  });

  socket.on('meeting:media', (media = {}) => {
    const here = currentCall(socket);
    if (!here) return;
    here.peer.media = { audio: Boolean(media.audio), video: Boolean(media.video), screen: Boolean(media.screen) };
    socket.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:peer-media', { socketId: socket.id, media: here.peer.media });
  });

  /** Raises or lowers your own hand; the host can lower anyone's. */
  socket.on('meeting:hand', ({ raised, socketId } = {}) => {
    const here = currentCall(socket);
    if (!here) return;
    const target = !socketId || socketId === socket.id ? here.peer : here.peer.canManage ? here.call.peers.get(socketId) : null;
    if (!target || (target !== here.peer && raised)) return;
    target.hand = raised ? Date.now() : null;
    io.to(roomChannel(here.meetingId, target.room)).emit('meeting:peer-hand', { socketId: target.socketId, hand: target.hand });
  });

  socket.on('meeting:reaction', ({ emoji } = {}) => {
    const here = currentCall(socket);
    if (!here || !REACTIONS.includes(emoji)) return;
    const now = Date.now();
    if (now - (socket.data.lastReactionAt ?? 0) < 250) return;
    socket.data.lastReactionAt = now;
    io.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:reaction', { socketId: socket.id, emoji });
  });

  /** Chat for the people in the same room; it lasts as long as the call. */
  socket.on('meeting:chat', ({ body } = {}, ack) => {
    const here = currentCall(socket);
    const text = typeof body === 'string' ? body.trim().slice(0, 1000) : '';
    if (!here || !text) return ack?.({ ok: false, error: 'Write a message first' });
    if (!allowChat(socket)) return ack?.({ ok: false, error: 'You are sending messages too quickly. Wait a moment.' });
    const message = { id: crypto.randomUUID(), at: new Date().toISOString(), author: here.peer.user, body: text, room: here.peer.room, broadcast: false };
    remember(here.call, here.peer.room, message);
    io.to(roomChannel(here.meetingId, here.peer.room)).emit('meeting:chat', message);
    ack?.({ ok: true });
  });

  /** Anyone signed in who is in the call can let a waiting guest in, or turn them away. */
  socket.on('meeting:admit', ({ socketId, allow } = {}) => {
    const here = currentCall(socket);
    if (!here || here.peer.guest) return;
    const waiting = here.call.lobby.get(socketId);
    if (!waiting) return;
    here.call.lobby.delete(socketId);
    const guestSocket = io.sockets.sockets.get(socketId);
    if (guestSocket) guestSocket.data.lobbyMeetingId = null;
    if (allow) {
      here.call.admitted.add(waiting.user.id);
      io.to(socketId).emit('meeting:admitted', { by: here.peer.user.name });
    } else {
      io.to(socketId).emit('meeting:denied', { by: here.peer.user.name });
    }
    announceLobby(io, here.meetingId, here.call);
  });

  /** The host splits the call: `rooms` is [{ name, socketIds }]; anyone not listed stays in the main room. */
  socket.on('meeting:breakouts:open', ({ rooms } = {}, ack) => {
    const here = currentCall(socket);
    if (!here?.peer.canManage) return ack?.({ ok: false, error: 'Only the host can open breakout rooms' });
    if (!Array.isArray(rooms) || rooms.length < 2 || rooms.length > MAX_BREAKOUT_ROOMS) {
      return ack?.({ ok: false, error: `Choose between 2 and ${MAX_BREAKOUT_ROOMS} rooms` });
    }
    const { call, meetingId } = here;
    const before = roomsNow(call);
    call.breakouts = { rooms: rooms.map((room, index) => ({ id: `room-${index + 1}`, name: String(room?.name ?? '').trim().slice(0, 40) || `Room ${index + 1}` })) };
    for (const peer of call.peers.values()) peer.room = null;
    rooms.forEach((room, index) => {
      for (const socketId of Array.isArray(room?.socketIds) ? room.socketIds : []) {
        const peer = call.peers.get(socketId);
        if (peer) peer.room = call.breakouts.rooms[index].id;
      }
    });
    regroup(io, meetingId, call, before);
    ack?.({ ok: true });
  });

  /** Moves someone (the host may move anyone; people may move themselves) to a room, or back to the main room. */
  socket.on('meeting:breakouts:move', ({ socketId, room } = {}, ack) => {
    const here = currentCall(socket);
    if (!here?.call.breakouts) return ack?.({ ok: false, error: 'Breakout rooms are closed' });
    const target = here.call.peers.get(socketId ?? socket.id);
    if (!target || (target !== here.peer && !here.peer.canManage)) return ack?.({ ok: false, error: 'Only the host can move other people' });
    const roomId = room ?? null;
    if (roomId && !here.call.breakouts.rooms.some((item) => item.id === roomId)) return ack?.({ ok: false, error: 'That room is closed' });
    const before = roomsNow(here.call);
    target.room = roomId;
    regroup(io, here.meetingId, here.call, before);
    ack?.({ ok: true });
  });

  socket.on('meeting:breakouts:close', (_payload, ack) => {
    const here = currentCall(socket);
    if (!here?.peer.canManage) return ack?.({ ok: false, error: 'Only the host can close breakout rooms' });
    const before = roomsNow(here.call);
    here.call.breakouts = null;
    for (const peer of here.call.peers.values()) peer.room = null;
    regroup(io, here.meetingId, here.call, before);
    ack?.({ ok: true });
  });

  /** A message from the host to every room at once. */
  socket.on('meeting:breakouts:broadcast', ({ body } = {}, ack) => {
    const here = currentCall(socket);
    const text = typeof body === 'string' ? body.trim().slice(0, 500) : '';
    if (!here?.peer.canManage || !here.call.breakouts || !text) return ack?.({ ok: false, error: 'Write a message for the rooms' });
    const message = { id: crypto.randomUUID(), at: new Date().toISOString(), author: here.peer.user, body: text, room: null, broadcast: true };
    for (const room of [null, ...here.call.breakouts.rooms.map((item) => item.id)]) remember(here.call, room, { ...message, room });
    io.to(meetingChannel(here.meetingId)).emit('meeting:chat', message);
    ack?.({ ok: true });
  });

  socket.on('meeting:leave', () => void leave(io, socket));
  socket.on('disconnect', () => void leave(io, socket));
}
