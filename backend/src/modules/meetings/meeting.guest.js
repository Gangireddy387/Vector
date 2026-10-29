import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Meeting, Organization, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { signGuestToken } from '../auth/token.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { iceServersFor } from './ice-servers.js';

/**
 * Guest links: people outside the organization open /join/<token>, give their name and wait in the lobby until
 * someone in the call lets them in. A repeating meeting keeps one link, which always opens its current occurrence.
 */

const endsAt = (meeting) => new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000);

async function occurrenceFor(token) {
  const meetings = await Meeting.findAll({
    where: { guestToken: token },
    include: [{ model: User, as: 'host', attributes: ['name', 'avatarUrl', 'avatarColor'] }],
    order: [['startsAt', 'ASC']],
  });
  if (!meetings.length) throw ApiError.notFound('This meeting link does not work any more. Ask the host for a new one.');
  const now = Date.now();
  const meeting =
    meetings.find((item) => item.status === 'live') ??
    meetings.find((item) => item.status === 'scheduled' && endsAt(item).getTime() > now) ??
    meetings[meetings.length - 1];
  const organization = await Organization.findByPk(meeting.organizationId, { include: withPlan() });
  if (!organization || organization.status !== 'approved' || !entitlementsFor(organization).features.meetings) {
    throw ApiError.notFound('This meeting link does not work any more. Ask the host for a new one.');
  }
  let reason = null;
  if (meeting.status === 'cancelled') reason = 'This meeting was cancelled.';
  else if (meeting.status === 'ended' || (meeting.status === 'scheduled' && endsAt(meeting).getTime() <= now)) reason = 'This meeting is over.';
  return { meeting, organization, reason };
}

function describe({ meeting, organization, reason }) {
  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt,
      endsAt: endsAt(meeting),
      durationMinutes: meeting.durationMinutes,
      status: meeting.status,
      host: meeting.host ? { name: meeting.host.name, avatarUrl: meeting.host.avatarUrl, avatarColor: meeting.host.avatarColor } : null,
    },
    organization: { id: organization.id, name: organization.name, logoUrl: organization.logoUrl },
    joinable: !reason,
    reason,
  };
}

const guestLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const guestSchema = z.object({ name: z.string().trim().min(2, 'Enter your name (at least 2 characters)').max(60) });

export const publicMeetingRoutes = Router();

publicMeetingRoutes.get('/meeting-links/:token', guestLimiter, async (req, res) => res.json(describe(await occurrenceFor(req.params.token))));

/** Gives a guest a pass for the call (valid 12 hours) and the network servers their browser needs to connect. */
publicMeetingRoutes.post('/meeting-links/:token/guests', guestLimiter, validate({ body: guestSchema }), async (req, res) => {
  const found = await occurrenceFor(req.params.token);
  if (found.reason) throw ApiError.badRequest(found.reason);
  const guestId = crypto.randomUUID();
  const token = signGuestToken({ meetingId: found.meeting.id, guestId, name: req.body.name });
  res.status(201).json({ ...describe(found), token, guest: { id: `guest:${guestId}`, name: req.body.name }, ice: await iceServersFor(`guest-${guestId}`) });
});
