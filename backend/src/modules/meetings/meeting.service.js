import { Op } from 'sequelize';
import { CalendarEvent, Department, Meeting, MeetingParticipant, MeetingUpdate, OrganizationMember, Project, Team, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser, isUserOnline } from '../../shared/realtime/socket.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { peopleInCall } from './meeting.signaling.js';

/*
 * Every function takes the `viewer`: { id, name, organization, isAdmin }. Organization admins, department heads and
 * team leads schedule meetings; the host, the invited people and organization admins can open them.
 */

const PAST_GRACE_MS = 5 * 60_000;
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

function summarize(meeting, viewer) {
  const json = meeting.toJSON();
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
    inCall: peopleInCall(json.id),
    canManage: viewer.isAdmin || json.hostId === viewer.id,
  };
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
  const where = { organizationId, ...(context ? { contextType: context.type, contextId: context.id } : {}) };
  if (!viewer.isAdmin) {
    const ids = (await MeetingParticipant.findAll({ where: { userId: viewer.id }, attributes: ['meetingId'], raw: true })).map((row) => row.meetingId);
    where[Op.or] = [{ hostId: viewer.id }, { id: ids }];
  }
  const meetings = await Meeting.findAll({ where, include: includeAll, order: [['startsAt', scope === 'past' ? 'DESC' : 'ASC']], limit: 200 });
  const now = Date.now();
  const isUpcoming = (meeting) => meeting.status === 'live' || (meeting.status === 'scheduled' && endsAt(meeting).getTime() > now);
  return meetings.filter((meeting) => (scope === 'past' ? !isUpcoming(meeting) : isUpcoming(meeting))).map((meeting) => summarize(meeting, viewer));
}

export async function getMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  const updates = await MeetingUpdate.findAll({
    where: { meetingId },
    include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'ASC']],
  });
  return { meeting: summarize(meeting, viewer), updates };
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
}

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
  const created = await Meeting.create({
    organizationId: viewer.organization.id,
    hostId: viewer.id,
    title: input.title,
    agenda: input.agenda ?? null,
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    contextType: context?.type ?? null,
    contextId: context?.id ?? null,
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

export async function updateMeeting(viewer, meetingId, changes) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (['ended', 'cancelled'].includes(meeting.status) && Object.keys(changes).some((key) => key !== 'notes')) {
    throw ApiError.badRequest('This meeting is over; only its notes can still change');
  }
  if (changes.startsAt && new Date(changes.startsAt).getTime() !== new Date(meeting.startsAt).getTime()) assertNotInPast(changes.startsAt);

  const { participantIds, ...fields } = changes;
  await meeting.update(fields);
  let added = [];
  if (participantIds) added = await setParticipants(meeting, await activeMemberIds(viewer.organization.id, participantIds));
  const updated = await reload(meeting);
  if (participantIds || fields.startsAt || fields.durationMinutes || fields.title || fields.agenda !== undefined) await syncCalendar(updated);
  await invite(updated, viewer, added);
  notifyChanged(updated);
  return summarize(updated, viewer);
}

export async function cancelMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (meeting.status === 'ended') throw ApiError.badRequest('This meeting already ended');
  await meeting.update({ status: 'cancelled' });
  await syncCalendar(meeting);
  await notifyUsers({
    userIds: meeting.participants.map((participant) => participant.userId),
    actorId: viewer.id,
    type: 'meeting_cancelled',
    title: `“${meeting.title}” was cancelled`,
    body: `${viewer.name} cancelled the meeting.`,
    link: meetingLink(meeting),
    email: false,
  });
  notifyChanged(meeting);
  return summarize(await reload(meeting), viewer);
}

/** Ends the call for everyone; the notes and updates stay. */
export async function endMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  if (meeting.status !== 'ended') await meeting.update({ status: 'ended', endedAt: new Date() });
  notifyChanged(meeting);
  return summarize(await reload(meeting), viewer);
}

/** Removes a meeting that is over (ended, cancelled, or its time passed without a call), with its updates and notes. */
export async function deleteMeeting(viewer, meetingId) {
  const meeting = await loadMeeting(viewer, meetingId);
  assertManage(viewer, meeting);
  const isOver = ['ended', 'cancelled'].includes(meeting.status) || (meeting.status === 'scheduled' && endsAt(meeting).getTime() <= Date.now());
  if (!isOver || peopleInCall(meeting.id).length) throw ApiError.badRequest('Only past meetings can be deleted. Cancel an upcoming meeting instead.');
  await CalendarEvent.destroy({ where: { meetingId: meeting.id } });
  await meeting.destroy();
  notifyChanged(meeting);
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
