import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config/index.js';
import { Meeting, MeetingFile, MeetingParticipant } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { isUuid } from '../../shared/utils/ids.js';
import { deleteStoredFile, resolveStoragePath, storage, toStorageKey } from '../attachments/attachment.storage.js';
import { originalFileName } from '../attachments/attachment.service.js';
import { signFileToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';

/**
 * Files shared in a call's chat. People from the organization upload them (guests can open them); everyone in the
 * call gets them through short-lived links, because images are shown inline and the browser loads those by address.
 */

/** Shown inside the chat; everything else downloads. */
const INLINE_TYPES = /^image\/(png|jpeg|gif|webp)$/i;
/** Types a browser could run as a page or script; always handed over as plain downloads. */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

const upload = multer({ storage, limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 1 } });

export const fileView = (file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, size: file.size });
export const fileLink = (fileId) => `/api/meeting-files/${fileId}?token=${encodeURIComponent(signFileToken(fileId))}`;

/** A file of this meeting uploaded by this person, ready to attach to their chat message. */
export async function ownFile(meetingId, fileId, uploaderId) {
  if (!isUuid(fileId)) return null;
  return MeetingFile.findOne({ where: { id: fileId, meetingId, uploaderId } });
}

export async function deleteMeetingFiles(meetingId) {
  const files = await MeetingFile.findAll({ where: { meetingId }, attributes: ['storageKey'] });
  await Promise.all(files.map((file) => deleteStoredFile(file.storageKey)));
}

/** Host, invited people and organization admins of this organization's meeting. */
async function invitedMeeting(req, meetingId) {
  if (!isUuid(meetingId)) throw ApiError.notFound('Meeting not found');
  const meeting = await Meeting.findOne({ where: { id: meetingId, organizationId: req.organization.id } });
  if (!meeting) throw ApiError.notFound('Meeting not found');
  const invited = meeting.hostId === req.user.id || (await MeetingParticipant.count({ where: { meetingId, userId: req.user.id } }));
  if (!invited && req.organizationRole !== 'admin') throw ApiError.notFound('Meeting not found');
  return meeting;
}

export const meetingFileRoutes = Router();

/** Checked before anything is written to disk. */
const assertInvited = async (req, _res, next) => {
  req.meeting = await invitedMeeting(req, req.params.meetingId);
  if (['cancelled'].includes(req.meeting.status)) throw ApiError.badRequest('This meeting was cancelled');
  next();
};

meetingFileRoutes.post('/meetings/:meetingId/files', assertInvited, upload.single('file'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest(`Choose a file of at most ${config.uploads.maxFileSizeMb} MB`);
  try {
    const file = await MeetingFile.create({
      meetingId: req.meeting.id,
      uploaderId: req.user.id,
      fileName: originalFileName(req.file.originalname).slice(0, 255),
      mimeType: (req.file.mimetype || 'application/octet-stream').slice(0, 120),
      size: req.file.size,
      storageKey: toStorageKey(req.file.path),
    });
    res.status(201).json({ file: fileView(file) });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    throw error;
  }
});

/** A link to open a file after the call (from the meeting page). */
meetingFileRoutes.get('/meetings/:meetingId/files/:fileId/link', async (req, res) => {
  const meeting = await invitedMeeting(req, req.params.meetingId);
  if (!isUuid(req.params.fileId) || !(await MeetingFile.count({ where: { id: req.params.fileId, meetingId: meeting.id } }))) throw ApiError.notFound('File not found');
  res.set('Cache-Control', 'no-store');
  res.json({ url: fileLink(req.params.fileId) });
});

export const publicMeetingFileRoutes = Router();

publicMeetingFileRoutes.get('/meeting-files/:fileId', async (req, res) => {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This link has expired. Open the file again from the meeting.');
  }
  if (payload.typ !== TOKEN_TYPES.file || payload.fid !== req.params.fileId) throw ApiError.unauthorized('This link is not valid');
  const file = await MeetingFile.findByPk(req.params.fileId);
  if (!file) throw ApiError.notFound('File not found');
  const inline = INLINE_TYPES.test(file.mimeType);
  res.type(ACTIVE_TYPES.test(file.mimeType) ? 'application/octet-stream' : file.mimeType);
  res.set('Cache-Control', 'private, max-age=3600');
  if (!inline) res.attachment(file.fileName);
  res.sendFile(resolveStoragePath(file.storageKey));
});
