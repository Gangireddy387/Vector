import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { config } from '../../config/index.js';
import { requireFeature } from '../plans/plan.service.js';
import { iceServersFor } from './ice-servers.js';
import { callCapacity, sfuEnabled } from './meeting.media.js';
import { MEETING_CONTEXTS, MEETING_RECURRENCES } from './meeting.model.js';
import { calendarFile } from './meeting.notify.js';
import { meetingRecordingRoutes } from './meeting.recordings.js';
import * as service from './meeting.service.js';
import { canSummarize } from './meeting.summary.js';

const fields = {
  title: z.string().trim().min(2, 'Give the meeting a title of at least 2 characters').max(160),
  agenda: z.string().trim().max(4000).nullable().optional(),
  startsAt: z.coerce.date({ message: 'Choose when the meeting starts' }),
  durationMinutes: z.number().int().min(15, 'Meetings last at least 15 minutes').max(480, 'Meetings last at most 8 hours'),
  participantIds: z.array(z.string().uuid()).max(100),
  recurrence: z.enum(MEETING_RECURRENCES).nullable().optional(),
};
const context = {
  contextType: z.enum(MEETING_CONTEXTS).nullable().optional(),
  contextId: z.string().uuid().nullable().optional(),
};
const createSchema = z.object({ ...fields, ...context, guestAccess: z.boolean().optional() });
const cancelSchema = z.object({ series: z.boolean().optional() });
const guestLinkSchema = z.object({ enabled: z.boolean(), reset: z.boolean().optional() });
const listSchema = z.object({ scope: z.enum(['upcoming', 'past']).optional(), ...context });
const updateSchema = z
  .object({ ...fields, notes: z.string().max(20000).nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change');
const updatePostSchema = z.object({ body: z.string().trim().min(1, 'Write your update').max(4000) });

/** Video meetings: scheduling, joining details, shared updates and notes (the call itself runs over the socket). */
const router = Router();
const base = '/meetings';
router.use(base, requireFeature('meetings'));
const viewer = (req) => ({ id: req.user.id, name: req.user.name, organization: req.organization, isAdmin: req.organizationRole === 'admin' });

router.get(base, validate({ query: listSchema }), async (req, res) => {
  const { scope, contextType, contextId } = req.filters;
  res.json({ meetings: await service.listMeetings(viewer(req), scope ?? 'upcoming', contextType && contextId ? { type: contextType, id: contextId } : null) });
});
router.get(`${base}/permissions`, async (req, res) => res.json({ canSchedule: await service.canSchedule(viewer(req)) }));
/** What this server's calls can do, so the app shows only what works. */
router.get(`${base}/capabilities`, (_req, res) =>
  res.json({ media: sfuEnabled() ? 'sfu' : 'direct', capacity: callCapacity(), summaries: canSummarize(), reminderMinutes: config.meetings.reminderMinutes, recordingMaxMb: config.meetings.recordingMaxMb }),
);
router.get(`${base}/ice-servers`, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await iceServersFor(req.user.id));
});
router.post(base, validate({ body: createSchema }), async (req, res) => res.status(201).json({ meeting: await service.createMeeting(viewer(req), req.body) }));
router.get(`${base}/:meetingId`, async (req, res) => res.json(await service.getMeeting(viewer(req), req.params.meetingId)));
router.patch(`${base}/:meetingId`, validate({ body: updateSchema }), async (req, res) =>
  res.json({ meeting: await service.updateMeeting(viewer(req), req.params.meetingId, req.body) }),
);
router.delete(`${base}/:meetingId`, async (req, res) => {
  await service.deleteMeeting(viewer(req), req.params.meetingId);
  res.status(204).end();
});
router.post(`${base}/:meetingId/cancel`, validate({ body: cancelSchema }), async (req, res) =>
  res.json({ meeting: await service.cancelMeeting(viewer(req), req.params.meetingId, req.body) }),
);
router.post(`${base}/:meetingId/guest-link`, validate({ body: guestLinkSchema }), async (req, res) =>
  res.json({ meeting: await service.setGuestAccess(viewer(req), req.params.meetingId, req.body) }),
);
router.post(`${base}/:meetingId/end`, async (req, res) => res.json({ meeting: await service.endMeeting(viewer(req), req.params.meetingId) }));
router.post(`${base}/:meetingId/updates`, validate({ body: updatePostSchema }), async (req, res) =>
  res.status(201).json({ update: await service.postUpdate(viewer(req), req.params.meetingId, req.body.body) }),
);
router.delete(`${base}/:meetingId/updates/:updateId`, async (req, res) => {
  await service.deleteUpdate(viewer(req), req.params.meetingId, req.params.updateId);
  res.status(204).end();
});
/** The meeting as a calendar file, to add it to Outlook, Google Calendar or Apple Calendar. */
router.get(`${base}/:meetingId/calendar.ics`, async (req, res) => {
  const meeting = await service.meetingRecord(viewer(req), req.params.meetingId);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.attachment(`${meeting.title.replace(/[^\w\s-]+/g, '').trim().slice(0, 60) || 'meeting'}.ics`);
  res.send(await calendarFile(meeting));
});
router.post(`${base}/:meetingId/summary`, async (req, res) => res.json({ summary: await service.writeSummary(viewer(req), req.params.meetingId) }));
router.use(meetingRecordingRoutes);

export default router;
