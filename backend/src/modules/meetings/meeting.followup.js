import { Op } from 'sequelize';
import { ChatMessage, Meeting, MeetingParticipant, MeetingRecording, Organization, User } from '../../database/models.js';
import { emitToProject } from '../../shared/realtime/socket.js';
import { appUrl, meetingRecapEmail } from '../../shared/services/email-templates.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { meetingAiAllowed } from './meeting.ai-access.js';
import { whenFor } from './meeting.notify.js';
import { meetingUrl } from './meeting.ring.js';
import { indexMeeting } from './meeting.search.js';
import { summarizeMeeting } from './meeting.summary.js';

/**
 * After a meeting ends (the host ended it, or the call emptied after its time): the summary and chapters are written,
 * the meeting is indexed for search, and everyone invited gets the recap (in the app, by email, and in the project's
 * chat when the meeting was about a project). Each meeting is claimed once, so several servers can run this safely;
 * a background job picks up meetings no server handled (e.g. after a restart).
 */

const SUMMARY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const RECAP_WINDOW_MS = 24 * 60 * 60_000;

async function invitedUsers(meeting) {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  const ids = [...new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean))];
  return User.findAll({ where: { id: ids, status: 'active' }, attributes: ['id', 'name', 'email', 'timezone', 'preferences'] });
}

const bullet = (item) => `- ${item.text}${item.owner ? ` (${item.owner})` : ''}${item.due ? `, due ${item.due}` : ''}`;

/** A short version of the recap for the project's chat (markdown). */
function chatRecap(meeting, summary, link) {
  return [
    `**Meeting recap: ${meeting.title}**`,
    summary?.text ?? 'The notes from the meeting are ready.',
    summary?.decisions?.length ? `**Decisions**\n${summary.decisions.map((text) => `- ${text}`).join('\n')}` : '',
    summary?.actionItems?.length ? `**Action items**\n${summary.actionItems.map(bullet).join('\n')}` : '',
    `[Open the meeting](${link})`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Sends the recap once (in the app, by email, and to the project's chat). Returns whether it was sent now. */
export async function sendRecap(meetingId) {
  const [claimed] = await Meeting.update({ recapSentAt: new Date() }, { where: { id: meetingId, recapSentAt: null } });
  if (!claimed) return false;
  const meeting = await Meeting.findByPk(meetingId);
  const [people, recordings, organization] = await Promise.all([
    invitedUsers(meeting),
    MeetingRecording.count({ where: { meetingId, status: 'ready' } }),
    Organization.findByPk(meeting.organizationId, { include: withPlan() }),
  ]);
  const summary = meeting.summary;
  const path = await meetingUrl(meeting);
  await notifyUsers({
    userIds: people.map((person) => person.id),
    type: 'meeting_recap',
    title: `Recap: “${meeting.title}”`,
    body: summary?.text?.slice(0, 200) || (recordings ? 'The recording and notes are ready.' : 'The notes from the meeting are ready.'),
    link: `/meetings/${meeting.id}`,
    email: false,
  });

  if (organization && entitlementsFor(organization).features.emailNotifications) {
    const items = summary?.actionItems ?? [];
    await Promise.all(
      people
        .filter((person) => person.email && person.preferences?.emailNotifications !== false)
        .map((person) =>
          sendEmail({
            to: person.email,
            ...meetingRecapEmail({
              title: meeting.title,
              when: whenFor(meeting.startedAt ?? meeting.startsAt, person.timezone),
              organization,
              summary,
              mine: items.filter((item) => item.ownerId === person.id),
              others: items.filter((item) => item.ownerId !== person.id),
              recordings,
              link: appUrl(path),
            }),
          }).catch((error) => console.warn('[meetings] could not email a recap:', error.message)),
        ),
    );
  }

  if (meeting.contextType === 'project' && meeting.contextId && organization && entitlementsFor(organization).features.chat) {
    const message = await ChatMessage.create({
      projectId: meeting.contextId,
      authorId: null,
      kind: 'bot',
      body: chatRecap(meeting, summary, appUrl(path)),
      meta: { type: 'meeting_recap', meetingId: meeting.id },
    });
    emitToProject(meeting.contextId, 'chat:message', { ...message.toJSON(), author: null, issues: [] });
  }
  return true;
}

/** Everything that follows a meeting; runs once per meeting (the first server to claim it). */
export async function runFollowup(meetingId) {
  const [claimed] = await Meeting.update({ followupAt: new Date() }, { where: { id: meetingId, status: 'ended', followupAt: null } });
  if (!claimed) return false;
  const meeting = await Meeting.findByPk(meetingId);
  const endedAt = new Date(meeting.endedAt ?? meeting.updatedAt).getTime();
  const recent = Date.now() - endedAt < SUMMARY_WINDOW_MS;
  if (recent && !meeting.summary && (await meetingAiAllowed(meeting.organizationId))) {
    await summarizeMeeting(meetingId).catch((error) => console.warn('[meetings] could not summarize a meeting:', error.message));
  }
  await indexMeeting(meetingId).catch((error) => console.warn('[meetings] could not index a meeting:', error.message));
  const fresh = await Meeting.findByPk(meetingId, { attributes: ['id', 'summary'] });
  const hasRecordings = await MeetingRecording.count({ where: { meetingId, status: 'ready' } });
  if (Date.now() - endedAt < RECAP_WINDOW_MS && (fresh.summary || hasRecordings)) await sendRecap(meetingId);
  return true;
}

export const followupInBackground = (meetingId) => void runFollowup(meetingId).catch((error) => console.warn('[meetings] after-meeting work failed:', error.message));

/** Background job: meetings that ended without their after-meeting work (a few per run). */
export async function runPendingFollowups() {
  // Recordings upload when the recording browser leaves; give them a moment before the recap goes out.
  const pending = await Meeting.findAll({
    where: { status: 'ended', followupAt: null, [Op.or]: [{ endedAt: null }, { endedAt: { [Op.lte]: new Date(Date.now() - 60_000) } }] },
    attributes: ['id'],
    order: [['endedAt', 'DESC']],
    limit: 10,
  });
  let done = 0;
  for (const { id } of pending) if (await runFollowup(id).catch(() => false)) done += 1;
  return done;
}
