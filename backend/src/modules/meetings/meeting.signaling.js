import { Op } from 'sequelize';
import { Meeting, MeetingParticipant, Organization, OrganizationMember, User } from '../../database/models.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/**
 * Video calls connect browsers directly to each other (WebRTC); the server only introduces them: it keeps who is in
 * each meeting room and passes their connection offers along. Every browser links to every other one, so a call is
 * capped at a size that works well that way.
 */
export const MAX_CALL_SIZE = 8;

/** meetingId → (socketId → { socketId, user, media }) */
const rooms = new Map();

export const peopleInCall = (meetingId) => [...new Set([...(rooms.get(meetingId)?.values() ?? [])].map((peer) => peer.user.id))];

const endsAt = (meeting) => new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000);

/** Host, invited people and the organization's admins may join while the meeting is not over and the plan allows it. */
async function joinableMeeting(meetingId, userId) {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) throw new Error('Meeting not found');
  if (meeting.status === 'cancelled') throw new Error('This meeting was cancelled');
  if (meeting.status === 'ended') throw new Error('This meeting has ended');
  if (meeting.status === 'scheduled' && endsAt(meeting) <= new Date()) throw new Error('This meeting’s time is over. Schedule a new one to meet again.');

  const [organization, membership] = await Promise.all([
    Organization.findByPk(meeting.organizationId, { include: withPlan() }),
    OrganizationMember.findOne({ where: { organizationId: meeting.organizationId, userId, status: 'active' } }),
  ]);
  if (!membership) throw new Error('You are not a member of this organization');
  if (!entitlementsFor(organization).features.meetings) throw new Error('Your organization’s plan does not include meetings');
  const invited = meeting.hostId === userId || (await MeetingParticipant.count({ where: { meetingId, userId } }));
  if (!invited && membership.role !== 'admin') throw new Error('You are not invited to this meeting');

  const user = await User.findByPk(userId, { attributes: USER_SUMMARY_ATTRIBUTES });
  return { meeting, user: user.toJSON() };
}

async function recordJoin(meeting, userId) {
  if (meeting.status === 'scheduled') await meeting.update({ status: 'live', startedAt: meeting.startedAt ?? new Date() });
  await MeetingParticipant.update({ joinedAt: new Date() }, { where: { meetingId: meeting.id, userId, joinedAt: null } });
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
  if (meeting.status !== 'live' || rooms.get(meeting.id)?.size) return false;
  if (endsAt(meeting) <= new Date()) await meeting.update({ status: 'ended', endedAt: new Date() });
  else await meeting.update({ status: 'scheduled' });
  return true;
}

async function leave(io, socket) {
  const meetingId = socket.data.meetingId;
  if (!meetingId) return;
  const room = rooms.get(meetingId);
  room?.delete(socket.id);
  if (room && !room.size) rooms.delete(meetingId);
  socket.leave(`meeting:${meetingId}`);
  socket.data.meetingId = null;
  io.to(`meeting:${meetingId}`).emit('meeting:peer-left', { socketId: socket.id });
  if (!rooms.has(meetingId)) {
    const meeting = await Meeting.findByPk(meetingId).catch(() => null);
    if (meeting) await settleEmptyMeeting(meeting).catch(() => undefined);
  }
  await announce(io, meetingId);
}

let ioRef = null;

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
    if (endsAt(meeting) > new Date() || rooms.get(meeting.id)?.size) continue;
    await meeting.update({ status: 'ended', endedAt: endsAt(meeting) });
    settled += 1;
    if (ioRef) await announce(ioRef, meeting.id);
  }
  return settled;
}

export function registerMeetingSignaling(io, socket) {
  ioRef = io;

  socket.on('meeting:join', async ({ meetingId, media } = {}, ack) => {
    try {
      const { meeting, user } = await joinableMeeting(meetingId, socket.data.userId);
      if (socket.data.meetingId) await leave(io, socket);
      const room = rooms.get(meetingId) ?? new Map();
      if (room.size >= MAX_CALL_SIZE) return ack?.({ ok: false, error: `This call is full (${MAX_CALL_SIZE} people). Try again when someone leaves.` });

      const self = { socketId: socket.id, user, media: { audio: Boolean(media?.audio), video: Boolean(media?.video), screen: false } };
      const peers = [...room.values()];
      room.set(socket.id, self);
      rooms.set(meetingId, room);
      socket.join(`meeting:${meetingId}`);
      socket.data.meetingId = meetingId;
      socket.to(`meeting:${meetingId}`).emit('meeting:peer-joined', self);
      await recordJoin(meeting, user.id);
      ack?.({ ok: true, selfId: socket.id, peers });
      void announce(io, meetingId);
    } catch (error) {
      ack?.({ ok: false, error: error.message });
    }
  });

  /** Connection offers, answers and network candidates, passed only between people in the same call. */
  socket.on('meeting:signal', ({ to, data } = {}) => {
    const room = rooms.get(socket.data.meetingId);
    if (!room?.has(socket.id) || !room.has(to)) return;
    io.to(to).emit('meeting:signal', { from: socket.id, data });
  });

  socket.on('meeting:media', (media = {}) => {
    const self = rooms.get(socket.data.meetingId)?.get(socket.id);
    if (!self) return;
    self.media = { audio: Boolean(media.audio), video: Boolean(media.video), screen: Boolean(media.screen) };
    socket.to(`meeting:${socket.data.meetingId}`).emit('meeting:peer-media', { socketId: socket.id, media: self.media });
  });

  socket.on('meeting:leave', () => void leave(io, socket));
  socket.on('disconnect', () => void leave(io, socket));
}
