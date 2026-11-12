import { config } from '../../config/index.js';
import { Meeting, MeetingParticipant, Organization, OrganizationMember, SupportMessage, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { isUuid } from '../../shared/utils/ids.js';
import { closeCall } from '../meetings/meeting.signaling.js';
import { iceServersFor } from '../meetings/ice-servers.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { pushToUsers } from '../push/push.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import {
  broadcast,
  describeSupportCall,
  findActiveSupportCall,
  organizationAdminIds,
  superAdminIds,
  supportCallPath,
  supportLink,
  withAuthor,
} from './support.service.js';

/*
 * Video calls between the Vector team (the portal's super admin) and an organization's admins. A support call is a
 * meeting of the organization marked `support`: the super admin may join it without belonging to the organization,
 * and it works whatever the organization's plan includes.
 */

const CALL_MINUTES = 60;

export const isPortalUser = (user) => Boolean(config.superAdmin.email) && user?.email?.toLowerCase() === config.superAdmin.email;

/** Rings everyone in the support conversation except the caller, each with the link for their side. */
async function ring(meeting, caller, portalIds, adminIds) {
  const card = (side) => ({
    meeting: { id: meeting.id, title: meeting.title },
    caller: { id: caller.id, name: caller.name, avatarUrl: caller.avatarUrl ?? null, avatarColor: caller.avatarColor },
    url: supportCallPath(meeting.id, side),
  });
  const groups = [
    { side: 'portal', ids: portalIds.filter((id) => id !== caller.id) },
    { side: 'organization', ids: adminIds.filter((id) => id !== caller.id) },
  ];
  for (const { side, ids } of groups) {
    if (!ids.length) continue;
    for (const userId of ids) emitToUser(userId, 'meeting:ringing', card(side));
    await pushToUsers(ids, {
      kind: 'call',
      title: side === 'organization' ? 'The Vector team is calling' : `${caller.name} is calling the Vector team`,
      body: 'Tap to join the video call.',
      url: supportCallPath(meeting.id, side),
      tag: `call-${meeting.id}`,
    }).catch(() => undefined);
  }
}

/**
 * Starts a video call with an organization's admins (from the super admin) or with the Vector team (from an
 * organization admin). When a call is already going, both sides land in that one instead of starting another.
 */
export async function startSupportCall(organizationId, caller, side) {
  const organization = await Organization.findByPk(organizationId, { attributes: ['id', 'name'] });
  if (!organization) throw ApiError.notFound('Organization not found');
  const [portalIds, adminIds] = await Promise.all([superAdminIds(), organizationAdminIds(organizationId)]);
  if (side === 'organization' && !portalIds.length) throw ApiError.badRequest('The Vector team is not set up to take calls yet');
  if (side === 'portal' && !adminIds.length) throw ApiError.badRequest('This organization has no active admins to call');

  let meeting = await findActiveSupportCall(organizationId);
  const isNew = !meeting;
  if (!meeting) {
    meeting = await Meeting.create({
      organizationId,
      hostId: caller.id,
      title: `Vector support · ${organization.name}`,
      startsAt: new Date(),
      durationMinutes: CALL_MINUTES,
      status: 'scheduled',
      kind: 'support',
      lobby: 'guests',
    });
  }
  await MeetingParticipant.bulkCreate(
    [...new Set([...portalIds, ...adminIds])].map((userId) => ({ meetingId: meeting.id, userId })),
    { ignoreDuplicates: true },
  );

  if (isNew) {
    const notice = await SupportMessage.create({
      organizationId,
      authorId: caller.id,
      fromPortal: side === 'portal',
      kind: 'system',
      body: `${caller.name} started a video call.`,
      readAt: new Date(),
    });
    await broadcast(organizationId, 'support:message', await withAuthor(notice.id));
    await ring(meeting, caller, portalIds, adminIds);
    if (side === 'portal') {
      await notifyUsers({
        userIds: adminIds,
        actorId: caller.id,
        type: 'support_call',
        title: 'The Vector team started a video call',
        body: 'Join from your support conversation or this notification.',
        link: supportCallPath(meeting.id, 'organization'),
        email: false,
      });
    }
  }

  for (const userId of portalIds) emitToUser(userId, 'support:call', { organizationId, call: describeSupportCall(meeting, 'portal') });
  for (const userId of adminIds) emitToUser(userId, 'support:call', { organizationId, call: describeSupportCall(meeting, 'organization') });
  return { call: describeSupportCall(meeting, side), started: isNew };
}

const recordingLabel = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Call recording';
  const minutes = Math.floor(seconds / 60);
  return `Call recording · ${minutes ? `${minutes} min ` : ''}${seconds % 60} s`.replace(/ 0 s$/, '');
};

/**
 * A recording of a support call was saved: it goes into the support chat so both sides can watch or download it
 * later. Recordings are kept even when disappearing messages are on.
 */
export async function postRecordingMessage(meeting, recording, author, side) {
  const organization = await Organization.findByPk(meeting.organizationId, { attributes: ['id', 'name', 'slug'] });
  const created = await SupportMessage.create({
    organizationId: meeting.organizationId,
    authorId: author.id,
    fromPortal: side === 'portal',
    kind: 'recording',
    body: recordingLabel(recording.durationSeconds),
    recording: {
      id: recording.id,
      meetingId: meeting.id,
      durationSeconds: recording.durationSeconds,
      sizeBytes: recording.sizeBytes === null ? null : Number(recording.sizeBytes),
      mimeType: recording.mimeType,
      startedAt: recording.startedAt,
    },
  });
  const message = await withAuthor(created.id);
  const adminIds = await broadcast(meeting.organizationId, 'support:message', message);
  if (side === 'portal') {
    await notifyUsers({
      userIds: adminIds,
      actorId: author.id,
      type: 'support_message',
      title: 'The Vector team shared a call recording',
      body: 'Watch or download it from your support chat.',
      link: supportLink(organization),
      email: false,
    });
  }
  return message;
}

/** A support call the person may join: the super admin, or an active admin of the organization. */
export async function loadSupportCall(user, meetingId) {
  const meeting = isUuid(meetingId) ? await Meeting.findByPk(meetingId) : null;
  if (!meeting || meeting.kind !== 'support') throw ApiError.notFound('Call not found');
  const portal = isPortalUser(user);
  if (!portal) {
    const admin = await OrganizationMember.count({ where: { organizationId: meeting.organizationId, userId: user.id, role: 'admin', status: 'active' } });
    if (!admin) throw ApiError.notFound('Call not found');
  }
  return { meeting, side: portal ? 'portal' : 'organization' };
}

/** What the call page needs before joining: the call, who it is with, whether it is still on, and network servers. */
export async function getSupportCall(user, meetingId) {
  const { meeting, side } = await loadSupportCall(user, meetingId);
  const [organization, host] = await Promise.all([
    Organization.findByPk(meeting.organizationId, { attributes: ['id', 'name', 'logoUrl'] }),
    meeting.hostId ? User.findByPk(meeting.hostId, { attributes: USER_SUMMARY_ATTRIBUTES }) : null,
  ]);
  const call = describeSupportCall(meeting, side);
  const over = ['ended', 'cancelled'].includes(meeting.status) || new Date(call.endsAt) <= new Date();
  return {
    call: { ...call, host: host?.toJSON() ?? null, startedAt: meeting.startedAt },
    organization: { id: organization.id, name: organization.name, logoUrl: organization.logoUrl ?? null },
    side,
    joinable: !over,
    reason: over ? 'This call has ended. Start a new one from the support chat.' : null,
    ice: await iceServersFor(user.id),
  };
}

/** Ends the call for everyone; either side can. */
export async function endSupportCall(user, meetingId) {
  const { meeting } = await loadSupportCall(user, meetingId);
  if (meeting.status !== 'ended') await meeting.update({ status: 'ended', endedAt: new Date() });
  await closeCall(meeting.id, 'ended');
  await broadcast(meeting.organizationId, 'support:call', { organizationId: meeting.organizationId, call: null });
  return getSupportCall(user, meetingId);
}

/** People the caller may start a support call for: the super admin picks the organization; admins call for their own. */
export function resolveCallOrganization(req, requestedId) {
  if (isPortalUser(req.user)) {
    if (!requestedId || !isUuid(requestedId)) throw ApiError.badRequest('Choose the organization to call');
    return { organizationId: requestedId, side: 'portal' };
  }
  if (!req.organization) throw ApiError.badRequest('Create or join an organization first');
  if (req.organizationRole !== 'admin') throw ApiError.forbidden('Only organization admins can call the Vector team');
  return { organizationId: req.organization.id, side: 'organization' };
}
