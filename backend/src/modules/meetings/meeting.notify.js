import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Meeting, MeetingParticipant, Organization, User } from '../../database/models.js';
import { appUrl, meetingEmail } from '../../shared/services/email-templates.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { pushToUsers } from '../push/push.service.js';
import { meetingIcs } from './meeting.ics.js';
import { meetingUrl, ringInvitees } from './meeting.ring.js';
import { callPresence, getIo } from './meeting.signaling.js';

/** Emails about meetings (with a calendar file) and the reminder before they start. */

const reminderMs = () => config.meetings.reminderMinutes * 60_000;

/** Meetings that start within the reminder window need no separate reminder: the invitation is it. */
export const remindedAtFor = (startsAt, now = Date.now()) => (new Date(startsAt).getTime() - now <= reminderMs() ? new Date(now) : null);

function durationText(minutes) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hour${hours > 1 ? 's' : ''}${rest ? ` ${rest} minutes` : ''}`;
}

/** "Tuesday 4 November 2026, 09:30 GMT+5:30" in the reader's time zone. */
export function whenFor(date, timeZone) {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timeZone || 'UTC' }).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(date));
  }
}

async function organizationOf(meeting) {
  const organization = await Organization.findByPk(meeting.organizationId, { include: withPlan() });
  return organization && entitlementsFor(organization).features.emailNotifications ? organization : null;
}

/** The calendar file of a meeting, for downloads and emails. */
export async function calendarFile(meeting, method = 'PUBLISH') {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  const [host, attendees] = await Promise.all([
    meeting.hostId ? User.findByPk(meeting.hostId, { attributes: ['name', 'email'] }) : null,
    User.findAll({ where: { id: participants.map((participant) => participant.userId) }, attributes: ['name', 'email'] }),
  ]);
  const json = typeof meeting.toJSON === 'function' ? meeting.toJSON() : meeting;
  return meetingIcs({ meeting: json, url: appUrl(await meetingUrl(meeting)), organizer: host, attendees, method });
}

/** Emails `userIds` that they were invited to (`invite`), that the meeting changed (`update`) or was cancelled (`cancel`). */
export async function emailMeeting(meeting, kind, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const organization = await organizationOf(meeting);
  if (!organization) return;
  const [host, people, ics, link] = await Promise.all([
    meeting.hostId ? User.findByPk(meeting.hostId, { attributes: ['name'] }) : null,
    User.findAll({ where: { id: ids, status: 'active' }, attributes: ['id', 'email', 'timezone', 'preferences'] }),
    calendarFile(meeting, kind === 'cancel' ? 'CANCEL' : 'REQUEST'),
    meetingUrl(meeting),
  ]);
  const method = kind === 'cancel' ? 'CANCEL' : 'REQUEST';
  await Promise.all(
    people
      .filter((person) => person.preferences?.emailNotifications !== false)
      .map((person) =>
        sendEmail({
          to: person.email,
          ...meetingEmail({
            kind,
            title: meeting.title,
            when: whenFor(meeting.startsAt, person.timezone),
            duration: durationText(meeting.durationMinutes),
            hostName: host?.name,
            organization,
            agenda: meeting.agenda,
            link,
          }),
          attachments: [{ filename: kind === 'cancel' ? 'cancelled.ics' : 'invite.ics', type: `text/calendar; charset=utf-8; method=${method}`, content: ics }],
        }),
      ),
  );
}

/**
 * Background job: shortly before a meeting starts, everyone invited who is not in its call yet is reminded (in the
 * app, by email and on their devices). When the call is already running, they are rung instead.
 */
export async function sendMeetingReminders() {
  const now = Date.now();
  const due = await Meeting.findAll({
    where: { status: ['scheduled', 'live'], remindedAt: null, startsAt: { [Op.lte]: new Date(now + reminderMs()), [Op.gte]: new Date(now - 5 * 60_000) } },
  });
  let sent = 0;
  for (const meeting of due) {
    const [claimed] = await Meeting.update({ remindedAt: new Date() }, { where: { id: meeting.id, remindedAt: null } });
    if (!claimed) continue;
    const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
    const { inCall } = (await callPresence([meeting.id])).get(meeting.id);
    const people = [...new Set([meeting.hostId, ...participants.map((participant) => participant.userId)])].filter((userId) => userId && !inCall.includes(userId));
    if (!people.length) continue;

    const minutes = Math.max(0, Math.round((new Date(meeting.startsAt).getTime() - now) / 60_000));
    const live = inCall.length > 0;
    const title = live ? `“${meeting.title}” has started` : minutes ? `“${meeting.title}” starts in ${minutes} min` : `“${meeting.title}” is starting`;
    const body = live
      ? `${inCall.length} ${inCall.length === 1 ? 'person is' : 'people are'} in the call. Join them.`
      : meeting.agenda?.slice(0, 200) || 'Open the meeting to join the call.';
    await notifyUsers({ userIds: people, type: 'meeting_reminder', title, body, link: `/meetings/${meeting.id}`, email: Boolean(await organizationOf(meeting)) });
    const io = getIo();
    if (live && io) {
      const caller = await User.findByPk(inCall[0], { attributes: ['id', 'name', 'avatarUrl', 'avatarColor'] });
      if (caller) await ringInvitees(io, meeting, caller.toJSON(), inCall).catch((error) => console.warn('[meetings] ringing failed:', error.message));
    } else {
      await pushToUsers(people, { kind: 'reminder', title, body, url: await meetingUrl(meeting), tag: `meeting-${meeting.id}` }, { ttlSeconds: 600 });
    }
    sent += 1;
  }
  return sent;
}
