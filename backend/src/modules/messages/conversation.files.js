import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ConversationFile } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { isUuid } from '../../shared/utils/ids.js';
import { originalFileName } from '../attachments/attachment.service.js';
import { resolveStoragePath, storage, toStorageKey } from '../attachments/attachment.storage.js';
import { signFileToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';
import { assertFeature } from '../plans/plan.service.js';
import { fileView, loadConversation } from './messages.service.js';

/**
 * Files shared in chats and channels. Uploaded first (so a post can carry several), then sent with a message. People
 * in the conversation open them through short-lived links, because images are shown inline and load by address.
 */

/** Shown inside the conversation; everything else downloads. */
const INLINE_TYPES = /^image\/(png|jpeg|gif|webp)$/i;
/** Types a browser could run as a page or script; always handed over as plain downloads. */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

const upload = multer({ storage, limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 1 } });
const viewer = (req) => ({ id: req.user.id, name: req.user.name, organization: req.organization, isAdmin: req.organizationRole === 'admin' });
const fileLink = (fileId) => `/api/conversation-files/${fileId}?token=${encodeURIComponent(signFileToken(fileId))}`;

export const conversationFileRoutes = Router();

/** Checked before anything is written to disk. */
const assertCanShare = async (req, _res, next) => {
  if (!isUuid(req.params.conversationId)) throw ApiError.notFound('Conversation not found');
  assertFeature(req.organization, 'attachments');
  await loadConversation(viewer(req), req.params.conversationId);
  next();
};

conversationFileRoutes.post('/conversations/:conversationId/files', assertCanShare, upload.single('file'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest(`Choose a file of at most ${config.uploads.maxFileSizeMb} MB`);
  try {
    const file = await ConversationFile.create({
      conversationId: req.params.conversationId,
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

conversationFileRoutes.get('/conversations/:conversationId/files/:fileId/link', async (req, res) => {
  if (!isUuid(req.params.conversationId) || !isUuid(req.params.fileId)) throw ApiError.notFound('File not found');
  await loadConversation(viewer(req), req.params.conversationId);
  const exists = await ConversationFile.count({ where: { id: req.params.fileId, conversationId: req.params.conversationId } });
  if (!exists) throw ApiError.notFound('File not found');
  res.set('Cache-Control', 'no-store');
  res.json({ url: fileLink(req.params.fileId) });
});

export const publicConversationFileRoutes = Router();

publicConversationFileRoutes.get('/conversation-files/:fileId', async (req, res) => {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This link has expired. Open the file again from the conversation.');
  }
  if (payload.typ !== TOKEN_TYPES.file || payload.fid !== req.params.fileId) throw ApiError.unauthorized('This link is not valid');
  const file = await ConversationFile.findByPk(req.params.fileId);
  if (!file) throw ApiError.notFound('File not found');
  const inline = INLINE_TYPES.test(file.mimeType);
  res.type(ACTIVE_TYPES.test(file.mimeType) ? 'application/octet-stream' : file.mimeType);
  res.set('Cache-Control', 'private, max-age=3600');
  if (!inline) res.attachment(file.fileName);
  res.sendFile(resolveStoragePath(file.storageKey));
});
