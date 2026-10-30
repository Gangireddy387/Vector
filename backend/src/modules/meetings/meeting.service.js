import crypto from 'node:crypto';
import { Op } from 'sequelize';
import {
  CalendarEvent,
  Department,
  Meeting,
  MeetingChatMessage,
  MeetingParticipant,
  MeetingRecording,
  MeetingTranscriptLine,
  MeetingUpdate,
  OrganizationMember,
  Project,
  Team,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser, isUserOnline } from '../../shared/realtime/socket.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { flushBoard, forgetBoard, meetingPolls } from './meeting.collab.js';
import { emailMeeting, remindedAtFor } from './meeting.notify.js';
import { nextStart } from './meeting.recurrence.js';
import { recordingView } from './meeting.recordings.js';
import { callPresence, closeCall, dismissLobby } from './meeting.signaling.js';
import { canSummarize, summarizeInBackground, summarizeMeeting } from './meeting.summary.js';

/*
 * Every function takes the `viewer`: { id, name, organization, isAdmin }. Organization admins, department heads and
 * team leads schedule meetings; the host, the invited people and organization admins can open them.
 */

const PAST_GRACE_MS = 5 * 60_000;
const MAX_DURATION_MS = 480 * 60_000;
const meetingLink = (meeting) => `/meetings/${meeting.id}`;
const includeAll = [
  { model: User, as: 'host', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: MeetingParticipant, as: 'participants', include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'lastSeenAt', 'timezone'] }] },
];

export async function canSchedule(viewer) {
  if (viewer.isAdmin) return true;
  const organizationId = viewer.organization.id;
  const [heads, leads] = await Promise.all([Department.count({ where: { organizationId, headId: viewer.id } }), Team.count({ where: { organizationId, leadId: viewer.id } })]);
  return heads + leads > 0;
}

const endsAt = (meeting) => new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000);
const newGuestToken = () => crypto.randomBytes(18).toString('base64url');

const NOBODY = { inCall: [], guests: 0 };

/** `presence`: who is in its call now (from `callPresence`). */
function summarize(meeting, viewer, presence = NOBODY) {
  const json = meeting.toJSON();
  const canManage = viewer.isAdmin || json.hostId === viewer.id;
  return {
    id: json.id,
    title: json.title,
    agenda: json.agenda,
    notes: json.notes,
    startsAt: json.startsAt,
    endsAt: endsAt(json),
    durationMinutes: json.durationMinutes,
    status: json.status,
    startedAt: json.startedAt,
    endedAt: json.endedAt,
    host: json.host,
    participants: (json.participants ?? [])
      .filter((participant) => participant.user)
      .map((participant) => {
        const { timezone: _timezone, ...user } = participant.user;
        return { ...user, joinedAt: participant.joinedAt, isOnline: isUserOnline(user.id) };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    context: json.contextType && json.contextId ? { type: json.contextType, id: json.contextId } : null,
    recurrence: json.recurrence,
    seriesId: json.seriesId,
    inCall: presence.inCall,
    guestsInCall: presence.guests,
    summary: json.summary ?? null,
    /** Only the people who manage the meeting see (and share) the guest link. */
    guestToken: canManage ? json.guestToken : null,
    guestAccess: Boolean(json.guestToken),
    canManage,
  };
}

async function present(meeting, viewer) {
  return summarize(meeting, viewer, (await callPresence([meeting.id])).get(meeting.id));
}

async function loadMeeting(viewer, meetingId) {
  const meeting = await Meeting.findOne({ where: { id: meetingId, organizationId: viewer.organization.id }, include: includeAll });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  const invited = meeting.hostId === viewer.id || meeting.participants.some((participant) => participant.userId === viewer.id);
  if (!invited && !viewer.isAdmin) throw ApiError.notFound('Meeting not found');
  return meeting;
}

function assertManage(viewer, meeting) {
  if (!viewer.isAdmin && meeting.hostId !== viewer.id) throw ApiError.forbidden('Only the host or an organization admin can change this meeting');
}

/** Upcoming (scheduled or live, not over yet) or past meetings this person is part of; admins see all of them. */
export async function listMeetings(viewer, scope, context = null) {
  const organizationId = viewer.organization.id;
  const now = Date.now();
  const conditions = [{ organizationId }];
  if (context) conditions.push({ contextType: context.type, contextId: context.id });
  if (!viewer.isAdmin) {
    const ids = (await MeetingParticipant.findAll({ where: { userId: viewer.id }, attributes: ['meetingId'], raw: true })).map((row) => row.meetingId);
    conditions.push({ [Op.or]: [{ hostId: viewer.id }, { id: ids }] });
  }
  // Narrowed in the database first (a meeting lasts at most 8 hours), so old meetings never crowd out upcoming ones.
  conditions.push(
    scope === 'past'
      ? { [Op.or]: [{ status: ['ended', 'cancelled'] }, { status: 'scheduled', startsAt: { [Op.lt]: new Date(now) } }] }
      : { [Op.or]: [{ status: 'live' }, { status: 'scheduled', startsAt: { [Op.gte]: new Date(now - MAX_DURATION_MS) } }] },
  );
  const meetings = await Meeting.findAll({ where: { [Op.and]: conditions }, include: includeAll, order: [['startsAt', scope === 'past' ? 'DESC' : 'ASC']], limit: 200 });
  const isUpcoming = (meeting) => meeting.status === 'live' || (meeting.status === 'scheduled' && endsAt(meeting).getTime() > now);
  const listed = meetings.filter((meeting) => (scope === 'past' ? !isUpcoming(meeting) : isUpcoming(meeting)));
  const presence = await callPresence(listed.map((meeting) => meeting.id));
  return listed.map((meeting) => summarize(meeting, viewer, presence.get(meeting.id)));
}

/** Everything kept with a meeting: updates, polls, whiteboard, the call's chat and transcript, and recordings. */
export async function getMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  const presence = (await callPresence([meeting.id])).get(meeting.id);
  if (presence.inCall.length) await flushBoard(meeting.id);
  const [updates, polls, board, chat, transcript, recordings] = await Promise.all([
    MeetingUpdate.findAll({
      where: { meetingId },
      include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }],
      order: [['createdAt', 'ASC']],
    }),
    meetingPolls(meetingId, viewer.id),
    Meeting.findByPk(meetingId, { attributes: ['whiteboard'] }),
    MeetingChatMessage.findAll({ where: { meetingId }, order: [['createdAt', 'ASC']], limit: 2000 }),
    MeetingTranscriptLine.findAll({ where: { meetingId }, order: [['spokenAt', 'ASC']], limit: 5000 }),
    MeetingRecording.findAll({ where: { meetingId }, include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }], order: [['startedAt', 'ASC']] }),
  ]);
  return {
    meeting: summarize(meeting, viewer, presence),
    updates,
    polls,
    whiteboard: board?.whiteboard?.strokes?.length ? board.whiteboard : null,
    chat: chat.map((row) => ({ id: row.id, at: row.createdAt, author: row.author, body: row.body, room: row.room, roomName: row.roomName, broadcast: row.broadcast })),
    transcript: transcript.map((line) => ({ id: line.id, speaker: line.speaker, text: line.text, at: line.spokenAt })),
    recordings: recordings.map((recording) => recordingView(recording, viewer, meeting)),
  };
}

async function activeMemberIds(organizationId, userIds) {
  if (!userIds.length) return [];
  const rows = await OrganizationMember.findAll({ where: { organizationId, status: 'active', userId: userIds }, attributes: ['userId'], raw: true });
  return rows.map((row) => row.userId);
}

/** Each invited person gets the meeting on their own calendar, at their local time; it follows later changes. */
async function syncCalendar(meeting) {
  await CalendarEvent.destroy({ where: { meetingId: meeting.id } });
  if (meeting.status === 'cancelled') return;
  const people = await User.findAll({ where: { id: [meeting.hostId, ...meeting.participants.map((participant) => participant.userId)].filter(Boolean) }, attributes: ['id', 'timezone'] });
  const finish = endsAt(meeting);
  await CalendarEvent.bulkCreate(
    people.map((person) => {
      const start = localDateTime(person.timezone, new Date(meeting.startsAt));
      const end = localDateTime(person.timezone, finish);
      return {
        organizationId: meeting.organizationId,
        ownerId: person.id,
        meetingId: meeting.id,
        title: meeting.title,
        description: meeting.agenda,
        date: start.date,
        allDay: false,
        startTime: start.time,
        endTime: end.date === start.date && end.time > start.time ? end.time : '23:59',
        category: 'meeting',
        location: meetingLink(meeting),
      };
    }),
  );
}

const reload = (meeting) => Meeting.findByPk(meeting.id, { include: includeAll });

async function setParticipants(meeting, userIds) {
  const wanted = new Set(userIds.filter((userId) => userId !== meeting.hostId));
  const current = new Set(meeting.participants.map((participant) => participant.userId));
  const added = [...wanted].filter((userId) => !current.has(userId));
  const removed = [...current].filter((userId) => !wanted.has(userId));
  if (removed.length) await MeetingParticipant.destroy({ where: { meetingId: meeting.id, userId: removed } });
  if (added.length) await MeetingParticipant.bulkCreate(added.map((userId) => ({ meetingId: meeting.id, userId })), { ignoreDuplicates: true });
  return added;
}

/** In the app, and by email with a calendar file (sent in the background so saving the meeting stays quick). */
async function invite(meeting, viewer, userIds) {
  if (!userIds.length) return;
  await notifyUsers({
    userIds,
    actorId: viewer.id,
    type: 'meeting_invite',
    title: `${viewer.name} invited you to “${meeting.title}”`,
    body: meeting.agenda?.slice(0, 200) || 'Open the meeting to see when it starts and join.',
    link: meetingLink(meeting),
    email: false,
  });
  mailLater(meeting, 'invite', userIds);
}

const mailLater = (meeting, kind, userIds) =>
  void emailMeeting(meeting, kind, userIds).catch((error) => console.warn(`[meetings] could not email the ${kind} for “${meeting.title}”:`, error.message));

const CONTEXT_MODELS = { department: Department, team: Team, project: Project };

/** The department, team or project a meeting is for; it must belong to the same organization. */
async function meetingContext(organizationId, type, id) {
  if (!type || !id) return null;
  const found = await CONTEXT_MODELS[type]?.count({ where: { id, organizationId } });
  if (!found) throw ApiError.badRequest(`That ${type} is not in your organization`);
  return { type, id };
}

function assertNotInPast(startsAt) {
  if (new Date(startsAt).getTime() < Date.now() - PAST_GRACE_MS) throw ApiError.badRequest('Choose a start time that has not passed yet');
}

export async function createMeeting(viewer, input) {
  if (!(await canSchedule(viewer))) throw ApiError.forbidden('Only organization admins, department heads and team leads can schedule meetings');
  assertNotInPast(input.startsAt);
  const participantIds = await activeMemberIds(viewer.organization.id, input.participantIds.filter((userId) => userId !== viewer.id));
  if (!participantIds.length) throw ApiError.badRequest('Invite at least one person from your organization');

  const context = await meetingContext(viewer.organization.id, input.contextType, input.contextId);
  const id = crypto.randomUUID();
  const created = await Meeting.create({
    id,
    organizationId: viewer.organization.id,
    hostId: viewer.id,
    title: input.title,
    agenda: input.agenda ?? null,
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    contextType: context?.type ?? null,
    contextId: context?.id ?? null,
    recurrence: input.recurrence ?? null,
    seriesId: input.recurrence ? id : null,
    guestToken: input.guestAccess ? newGuestToken() : null,
    remindedAt: remindedAtFor(input.startsAt),
  });
  await MeetingParticipant.bulkCreate(participantIds.map((userId) => ({ meetingId: created.id, userId })));
  const meeting = await reload(created);
  await syncCalendar(meeting);
  await invite(meeting, viewer, participantIds);
  notifyChanged(meeting);
  return summarize(meeting, viewer);
}

const notifyChanged = (meeting) => {
  const people = [meeting.hostId, ...meeting.participants.map((participant) => participant.userId)].filter(Boolean);
  for (const userId of new Set(people)) emitToUser(userId, 'meeting:changed', { id: meeting.id, status: meeting.status });
};

/** Occurrences of a series that have not happened yet (this one included when it is still ahead). */
const openOccurrences = (meeting) => ({ seriesId: meeting.seriesId, status: ['scheduled', 'live'] });

export async function updateMeeting(viewer, meetingId, changes) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (['ended', 'cancelled'].includes(meeting.status) && Object.keys(changes).some((key) => key !== 'notes')) {
    throw ApiError.badRequest('This meeting is over; only its notes can still change');
  }
  if (changes.startsAt && new Date(changes.startsAt).getTime() !== new Date(meeting.startsAt).getTime()) assertNotInPast(changes.startsAt);

  const { participantIds, recurrence, ...fields } = changes;
  if (recurrence !== undefined && recurrence !== meeting.recurrence) {
    // The rule belongs to the series: it changes on every occurrence still ahead, and the newest one carries it on.
    if (meeting.seriesId) await Meeting.update({ recurrence }, { where: openOccurrences(meeting) });
    else if (recurrence) fields.seriesId = meeting.id;
    fields.recurrence = recurrence;
  }
  const moved = fields.startsAt && new Date(fields.startsAt).getTime() !== new Date(meeting.startsAt).getTime();
  if (moved) fields.remindedAt = remindedAtFor(fields.startsAt);
  const detailsChanged =
    moved ||
    (fields.durationMinutes !== undefined && fields.durationMinutes !== meeting.durationMinutes) ||
    (fields.title !== undefined && fields.title !== meeting.title) ||
    (fields.agenda !== undefined && fields.agenda !== meeting.agenda);
  const before = new Set(meeting.participants.map((participant) => participant.userId));
  await meeting.update(fields);
  let added = [];
  if (participantIds) added = await setParticipants(meeting, await activeMemberIds(viewer.organization.id, participantIds));
  const updated = await reload(meeting);
  if (participantIds || detailsChanged) await syncCalendar(updated);
  await invite(updated, viewer, added);
  if (detailsChanged && updated.status === 'scheduled') {
    mailLater(updated, 'update', updated.participants.map((participant) => participant.userId).filter((userId) => before.has(userId)));
  }
  const removed = [...before].filter((userId) => !updated.participants.some((participant) => participant.userId === userId));
  if (removed.length) mailLater(updated, 'cancel', removed);
  notifyChanged(updated);
  return present(updated, viewer);
}

/**
 * Cancels one meeting. For a repeating meeting, `series` cancels this and every later occurrence and stops the
 * repeat; otherwise only this one is skipped and the next occurrence is scheduled right away.
 */
export async function cancelMeeting(viewer, meetingId, { series = false } = {}) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (meeting.status === 'ended') throw ApiError.badRequest('This meeting already ended');

  const cancelled = [meeting];
  if (series && meeting.seriesId) {
    const later = await Meeting.findAll({
      where: { seriesId: meeting.seriesId, status: 'scheduled', startsAt: { [Op.gt]: meeting.startsAt }, id: { [Op.ne]: meeting.id } },
      include: includeAll,
    });
    cancelled.push(...later);
    await Meeting.update({ recurrence: null }, { where: { seriesId: meeting.seriesId } });
  }
  for (const item of cancelled) {
    await item.update({ status: 'cancelled', ...(series ? { recurrence: null } : {}) });
    await closeCall(item.id, 'cancelled');
    await syncCalendar(item);
    notifyChanged(item);
    mailLater(item, 'cancel', item.participants.map((participant) => participant.userId));
  }
  if (!series && meeting.recurrence && !meeting.continued) await continueOccurrence(meeting);

  await notifyUsers({
    userIds: meeting.participants.map((participant) => participant.userId),
    actorId: viewer.id,
    type: 'meeting_cancelled',
    title: series && cancelled.length > 1 ? `“${meeting.title}” no longer repeats` : `“${meeting.title}” was cancelled`,
    body: series && cancelled.length > 1 ? `${viewer.name} cancelled this and the following meetings.` : `${viewer.name} cancelled the meeting.`,
    link: meetingLink(meeting),
    email: false,
  });
  return present(await reload(meeting), viewer);
}

/** Ends the call for everyone; the notes, updates, chat and transcript stay (and a summary is written when possible). */
export async function endMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (meeting.status !== 'ended') await meeting.update({ status: 'ended', endedAt: new Date() });
  await closeCall(meeting.id, 'ended');
  notifyChanged(meeting);
  summarizeInBackground(meeting.id);
  return summarize(await reload(meeting), viewer);
}

/** Removes a meeting that is over (ended, cancelled, or its time passed without a call), with everything kept with it. */
export async function deleteMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  const isOver = ['ended', 'cancelled'].includes(meeting.status) || (meeting.status === 'scheduled' && endsAt(meeting).getTime() <= Date.now());
  const { inCall } = (await callPresence([meeting.id])).get(meeting.id);
  if (!isOver || inCall.length) throw ApiError.badRequest('Only past meetings can be deleted. Cancel an upcoming meeting instead.');
  await forgetBoard(meeting.id);
  const recordings = await MeetingRecording.findAll({ where: { meetingId: meeting.id }, attributes: ['storageKey'] });
  await CalendarEvent.destroy({ where: { meetingId: meeting.id } });
  await meeting.destroy();
  await Promise.all(recordings.filter((recording) => recording.storageKey).map((recording) => deleteStoredFile(recording.storageKey)));
  notifyChanged(meeting);
}

/**
 * Turns the guest link on or off, or replaces it (`reset`) so the old one stops working. A repeating meeting keeps
 * one link for all its occurrences still ahead.
 */
export async function setGuestAccess(viewer, meetingId, { enabled, reset = false }) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (['ended', 'cancelled'].includes(meeting.status)) throw ApiError.badRequest('This meeting is over');
  const guestToken = enabled ? (reset || !meeting.guestToken ? newGuestToken() : meeting.guestToken) : null;
  if (meeting.seriesId) await Meeting.update({ guestToken }, { where: openOccurrences(meeting) });
  await meeting.update({ guestToken });
  if (!guestToken) await dismissLobby(meeting.id);
  return present(await reload(meeting), viewer);
}

/** The meeting row itself, for someone who may open it (e.g. to build its calendar file). */
export const meetingRecord = (viewer, meetingId) => loadMeeting(viewer, meetingId);

/** Writes the meeting's summary again from what was said, written and shared (host and admins). */
export async function writeSummary(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (!canSummarize()) throw ApiError.badRequest('Summaries need the AI assistant. Set OPENAI_API_KEY on the server to turn it on.');
  const summary = await summarizeMeeting(meeting.id);
  if (!summary) throw ApiError.badRequest('There is nothing to summarize yet: turn on captions, chat, or share updates and notes first.');
  return summary;
}

export async function postUpdate(viewer, meetingId, body) {
  const meeting = await loadMeeting(viewer, meetingId);
  if (meeting.status === 'cancelled') throw ApiError.badRequest('This meeting was cancelled');
  const created = await MeetingUpdate.create({ meetingId, authorId: viewer.id, body });
  const update = (await MeetingUpdate.findByPk(created.id, { include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }] })).toJSON();
  const people = new Set([meeting.hostId, ...meeting.participants.map((participant) => participant.userId)].filter(Boolean));
  for (const userId of people) emitToUser(userId, 'meeting:update', update);
  return update;
}

export async function deleteUpdate(viewer, meetingId, updateId) {
  const meeting = await loadMeeting(viewer, meetingId);
  const update = await MeetingUpdate.findOne({ where: { id: updateId, meetingId } });
  if (!update) throw ApiError.notFound('Update not found');
  if (update.authorId !== viewer.id && !viewer.isAdmin && meeting.hostId !== viewer.id) throw ApiError.forbidden('You can only remove your own updates');
  await update.destroy();
  const people = new Set([meeting.hostId, ...meeting.participants.map((participant) => participant.userId)].filter(Boolean));
  for (const userId of people) emitToUser(userId, 'meeting:update-removed', { meetingId, id: updateId });
}

/**
 * Schedules the next occurrence of a repeating meeting: same people, agenda, length and guest link, at the same local
 * time for the host. Occurrences that would already be over (e.g. after the server was down) are skipped.
 */
async function continueOccurrence(meeting) {
  const [host, root] = await Promise.all([
    meeting.hostId ? User.findByPk(meeting.hostId, { attributes: ['timezone'] }) : null,
    meeting.seriesId && meeting.seriesId !== meeting.id ? Meeting.findByPk(meeting.seriesId, { attributes: ['startsAt'] }) : meeting,
  ]);
  const timeZone = host?.timezone ?? 'UTC';
  const anchorDay = Number(localDateTime(timeZone, new Date((root ?? meeting).startsAt)).date.slice(8));
  const startsAt = nextStart({ startsAt: meeting.startsAt, recurrence: meeting.recurrence, timeZone, anchorDay, after: new Date() });

  const [claimed] = await Meeting.update({ continued: true }, { where: { id: meeting.id, continued: false } });
  if (!claimed) return null;
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  const participantIds = await activeMemberIds(
    meeting.organizationId,
    participants.map((participant) => participant.userId),
  );
  const next = await Meeting.create({
    organizationId: meeting.organizationId,
    hostId: meeting.hostId,
    title: meeting.title,
    agenda: meeting.agenda,
    startsAt,
    durationMinutes: meeting.durationMinutes,
    contextType: meeting.contextType,
    contextId: meeting.contextId,
    recurrence: meeting.recurrence,
    seriesId: meeting.seriesId ?? meeting.id,
    guestToken: meeting.guestToken,
    remindedAt: remindedAtFor(startsAt),
  });
  if (participantIds.length) await MeetingParticipant.bulkCreate(participantIds.map((userId) => ({ meetingId: next.id, userId })), { ignoreDuplicates: true });
  const loaded = await reload(next);
  await syncCalendar(loaded);
  notifyChanged(loaded);
  return loaded;
}

/** Background job: once an occurrence of a repeating meeting starts, the next one is put on everyone's calendar. */
export async function continueMeetingSeries() {
  const due = await Meeting.findAll({ where: { recurrence: { [Op.ne]: null }, continued: false, startsAt: { [Op.lte]: new Date() } } });
  let created = 0;
  for (const meeting of due) {
    try {
      if (await continueOccurrence(meeting)) created += 1;
    } catch (error) {
      console.error(`[meetings] could not schedule the next “${meeting.title}”:`, error.message);
    }
  }
  return created;
}
