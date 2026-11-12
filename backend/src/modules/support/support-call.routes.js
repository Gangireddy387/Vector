import fs from 'node:fs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { MeetingRecording } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { isUuid } from '../../shared/utils/ids.js';
import { deleteStoredFile, toStorageKey } from '../attachments/attachment.storage.js';
import { signRecordingToken } from '../auth/token.js';
import { recordingUpload } from '../meetings/meeting.recordings.js';
import { endSupportCall, getSupportCall, loadSupportCall, postRecordingMessage, resolveCallOrganization, startSupportCall } from './support-call.service.js';

const startSchema = z.object({ organizationId: z.string().uuid().optional() });
const startLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

/**
 * Video calls between the Vector team and an organization's admins. Signed in, but not tied to the current
 * organization: the super admin belongs to none.
 */
const supportCallRoutes = Router();

supportCallRoutes.post('/support-calls', startLimiter, validate({ body: startSchema }), async (req, res) => {
  const { organizationId, side } = resolveCallOrganization(req, req.body.organizationId);
  res.status(201).json(await startSupportCall(organizationId, req.user, side));
});
supportCallRoutes.get('/support-calls/:meetingId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getSupportCall(req.user, req.params.meetingId));
});
supportCallRoutes.post('/support-calls/:meetingId/end', async (req, res) => res.json(await endSupportCall(req.user, req.params.meetingId)));

// --- Recordings: saved into the support chat for both sides -------------------------

/** The recording of this call, by id. */
async function supportRecording(req) {
  if (!isUuid(req.params.recordingId)) throw ApiError.notFound('Recording not found');
  const { meeting, side } = await loadSupportCall(req.user, req.params.meetingId);
  const recording = await MeetingRecording.findOne({ where: { id: req.params.recordingId, meetingId: meeting.id } });
  if (!recording) throw ApiError.notFound('Recording not found');
  return { meeting, side, recording };
}

/** Before any byte is written: a recording of this call, started by this person, still waiting for its file. */
async function assertMayUpload(req, _res, next) {
  const found = await supportRecording(req);
  if (found.recording.createdById !== req.user.id) throw ApiError.forbidden('Only the person who recorded can upload the recording');
  if (found.recording.status === 'ready') throw ApiError.badRequest('This recording was already saved');
  Object.assign(req, found);
  next();
}

/** The finished file (field `file`, plus `durationSeconds`); it appears in the support chat as a recording message. */
supportCallRoutes.post('/support-calls/:meetingId/recordings/:recordingId', assertMayUpload, recordingUpload.single('file'), async (req, res) => {
  const { meeting, recording, side } = req;
  if (!req.file) {
    await recording.update({ status: 'failed' });
    throw ApiError.badRequest(`Upload a video file of at most ${config.meetings.recordingMaxMb} MB`);
  }
  const duration = Number.parseInt(req.body?.durationSeconds, 10);
  try {
    await recording.update({
      status: 'ready',
      storageKey: toStorageKey(req.file.path),
      mimeType: req.file.mimetype.split(';')[0],
      sizeBytes: req.file.size,
      durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    throw error;
  }
  res.status(201).json({ message: await postRecordingMessage(meeting, recording, req.user, side) });
});

/** A recording that could not start (the person cancelled the screen picker): removed again. */
supportCallRoutes.delete('/support-calls/:meetingId/recordings/:recordingId', async (req, res) => {
  const { recording } = await supportRecording(req);
  if (recording.createdById !== req.user.id || recording.status === 'ready') throw ApiError.forbidden('Delete saved recordings from the support chat');
  await recording.destroy();
  if (recording.storageKey) await deleteStoredFile(recording.storageKey);
  res.status(204).end();
});

/** A link to watch or download the recording, valid for a few hours (video players cannot send a sign-in). */
supportCallRoutes.get('/support-calls/:meetingId/recordings/:recordingId/link', async (req, res) => {
  const { recording } = await supportRecording(req);
  if (recording.status !== 'ready') throw ApiError.notFound('Recording not found');
  res.set('Cache-Control', 'no-store');
  res.json({ url: `/api/meeting-recordings/${recording.id}/file?token=${encodeURIComponent(signRecordingToken(recording.id))}` });
});

export default supportCallRoutes;
