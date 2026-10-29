import { MeetingParticipant, Organization } from '../../database/models.js';
import { pushToUsers } from '../push/push.service.js';

/** Organization links open the meeting in the right organization, also for people who belong to several. */
async function meetingUrl(meeting) {
  const organization = await Organization.findByPk(meeting.organizationId, { attributes: ['slug'] });
  return organization ? `/${organization.slug}/meetings/${meeting.id}` : `/meetings/${meeting.id}`;
}

/**
 * Someone started the call: everyone else invited is rung, in the open app (an incoming-call card) and on the devices
 * where they turned notifications on (phones included, through the installed app).
 */
export async function ringInvitees(io, meeting, caller, alreadyInCall = []) {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  const skip = new Set([caller.id, ...alreadyInCall]);
  const people = [...new Set([meeting.hostId, ...participants.map((participant) => participant.userId)])].filter((userId) => userId && !skip.has(userId));
  if (!people.length) return;
  const url = await meetingUrl(meeting);
  const card = {
    meeting: { id: meeting.id, title: meeting.title },
    caller: { id: caller.id, name: caller.name, avatarUrl: caller.avatarUrl ?? null, avatarColor: caller.avatarColor },
    url,
  };
  for (const userId of people) io.to(`user:${userId}`).emit('meeting:ringing', card);
  await pushToUsers(people, {
    kind: 'call',
    title: `${caller.name} started “${meeting.title}”`,
    body: 'Tap to join the video call.',
    url,
    tag: `call-${meeting.id}`,
  });
}

/** A guest is waiting and nobody in the call can let them in: tell the host wherever they are. */
export async function knockHost(io, meeting, guestName) {
  if (!meeting.hostId) return;
  const url = await meetingUrl(meeting);
  io.to(`user:${meeting.hostId}`).emit('meeting:knock', { meeting: { id: meeting.id, title: meeting.title }, name: guestName, url });
  await pushToUsers([meeting.hostId], {
    kind: 'knock',
    title: `${guestName} is waiting to join “${meeting.title}”`,
    body: 'Join the call to let them in.',
    url,
    tag: `knock-${meeting.id}`,
  });
}
