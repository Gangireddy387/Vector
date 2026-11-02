import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config/index.js';
import { Meeting, MeetingParticipant, MeetingRecording, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { isUuid } from '../../shared/utils/ids.js';
import { deleteStoredFile, resolveStoragePath, storage, toStorageKey } from '../attachments/attachment.storage.js';
import { signRecordingToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';

/**
 * Call recordings. The person who records makes the file in their browser and uploads it here when they stop; everyone
 * invited can watch it afterwards through a link that works for a few hours (video players cannot send a sign-in).
 */

const VIDEO_TYPES = /^video\/(webm|mp4|x-matroska)(;|$)/;

const upload = multer({
  storage,
  limits: { fileSize: config.meetings.recordingMaxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, VIDEO_TYPES.test(file.mimetype)),
});

export function recordingView(recording, viewer, meeting) {
  const json = typeof recording.toJSON === 'function' ? recording.toJSON() : recording;
  return {
    id: json.id,
    status: json.status,
    mimeType: json.mimeType,
    sizeBytes: json.sizeBytes === null || json.sizeBytes === undefined ? null : Number(json.sizeBytes),
    durationSeconds: json.durationSeconds,
    startedAt: json.startedAt,
    createdBy: json.createdBy ? { id: json.createdBy.id, name: json.createdBy.name } : null,
    canDelete: viewer.isAdmin || meeting.hostId === viewer.id || json.createdById === viewer.id,
  };
}

/** The meeting in this organization that the viewer was invited to (or that they administer). */
async function invitedMeeting(req, meetingId) {
  const meeting = await Meeting.findOne({ where: { id: meetingId, organizationId: req.organization.id } });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  const isAdmin = req.organizationRole === 'admin';
  const invited = meeting.hostId === req.user.id || (await MeetingParticipant.count({ where: { meetingId, userId: req.user.id } }));
  if (!invited && !isAdmin) throw ApiError.notFound('Meeting not found');
  return { meeting, viewer: { id: req.user.id, isAdmin } };
}

async function announce(meeting) {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  for (const userId of new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean))) {
    emitToUser(userId, 'meeting:recordings', { meetingId: meeting.id });
  }
}

export const meetingRecordingRoutes = Router();

/**
 * Before any byte is written: the recording must exist in a meeting this person is invited to, have been started by
 * them, and still be waiting for its file. Only then does the upload reach the disk.
 */
async function assertMayUpload(req, _res, next) {
  if (!isUuid(req.params.meetingId) || !isUuid(req.params.recordingId)) throw ApiError.notFound('Recording not found');
  const { meeting } = await invitedMeeting(req, req.params.meetingId);
  const recording = await MeetingRecording.findOne({ where: { id: req.params.recordingId, meetingId: meeting.id } });
  if (!recording) throw ApiError.notFound('Recording not found');
  if (recording.createdById !== req.user.id) throw ApiError.forbidden('Only the person who recorded can upload the recording');
  if (recording.status === 'ready') throw ApiError.badRequest('This recording was already saved');
  Object.assign(req, { meeting, recording });
  next();
}

/** The finished file of a recording this person started (field `file`, plus `durationSeconds`). */
meetingRecordingRoutes.post('/meetings/:meetingId/recordings/:recordingId', assertMayUpload, upload.single('file'), async (req, res) => {
  const { meeting, recording } = req;
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
  await announce(meeting);
  const loaded = await MeetingRecording.findByPk(recording.id, { include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }] });
  res.status(201).json({ recording: recordingView(loaded, { id: req.user.id, isAdmin: req.organizationRole === 'admin' }, meeting) });
});

/** A link to watch or download the recording, valid for a few hours. */
meetingRecordingRoutes.get('/meetings/:meetingId/recordings/:recordingId/link', async (req, res) => {
  const { meeting } = await invitedMeeting(req, req.params.meetingId);
  const recording = await MeetingRecording.findOne({ where: { id: req.params.recordingId, meetingId: meeting.id, status: 'ready' } });
  if (!recording) throw ApiError.notFound('Recording not found');
  const token = signRecordingToken(recording.id);
  res.set('Cache-Control', 'no-store');
  res.json({ url: `/api/meeting-recordings/${recording.id}/file?token=${encodeURIComponent(token)}` });
});

meetingRecordingRoutes.delete('/meetings/:meetingId/recordings/:recordingId', async (req, res) => {
  const { meeting, viewer } = await invitedMeeting(req, req.params.meetingId);
  const recording = await MeetingRecording.findOne({ where: { id: req.params.recordingId, meetingId: meeting.id } });
  if (!recording) throw ApiError.notFound('Recording not found');
  if (!recordingView(recording, viewer, meeting).canDelete) throw ApiError.forbidden('Only the host or who recorded can delete this recording');
  await recording.destroy();
  if (recording.storageKey) await deleteStoredFile(recording.storageKey);
  await announce(meeting);
  res.status(204).end();
});

/** The file itself, for the link above (supports seeking: browsers ask for byte ranges). */
export const publicRecordingRoutes = Router();

publicRecordingRoutes.get('/meeting-recordings/:recordingId/file', async (req, res) => {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This recording link has expired. Open the meeting to get a new one.');
  }
  if (payload.typ !== TOKEN_TYPES.recording || payload.rid !== req.params.recordingId) throw ApiError.unauthorized('This recording link is not valid');
  const recording = await MeetingRecording.findOne({ where: { id: req.params.recordingId, status: 'ready' } });
  if (!recording?.storageKey) throw ApiError.notFound('Recording not found');
  const extension = recording.mimeType === 'video/mp4' ? 'mp4' : 'webm';
  res.set('Content-Type', recording.mimeType ?? 'video/webm');
  if (req.query.download === '1') res.attachment(`meeting-recording-${recording.startedAt.toISOString().slice(0, 10)}.${extension}`);
  res.sendFile(resolveStoragePath(recording.storageKey), { acceptRanges: true });
});
