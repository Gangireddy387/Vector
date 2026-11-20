import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ChatFile } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { isUuid } from '../../shared/utils/ids.js';
import { isInlineMime, safeResponseMime } from '../../shared/utils/preview-mime.js';
import { originalFileName } from '../attachments/attachment.service.js';
import { resolveStoragePath, storage, toStorageKey } from '../attachments/attachment.storage.js';
import { signFileToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';
import { assertFeature } from '../plans/plan.service.js';
import { assertProjectRole } from '../projects/project-access.js';

const upload = multer({ storage, limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 1 } });
const fileLink = (fileId) => `/api/chat-files/${fileId}?token=${encodeURIComponent(signFileToken(fileId))}`;

export const chatFileView = (file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, size: file.size });

export const chatFileRoutes = Router();

chatFileRoutes.post('/projects/:projectId/chat/files', async (req, _res, next) => {
  if (!isUuid(req.params.projectId)) throw ApiError.notFound('Project not found');
  assertFeature(req.organization, 'attachments');
  await assertProjectRole(req.params.projectId, req.user.id, 'member');
  next();
}, upload.single('file'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest(`Choose a file of at most ${config.uploads.maxFileSizeMb} MB`);
  try {
    const file = await ChatFile.create({
      projectId: req.params.projectId,
      uploaderId: req.user.id,
      fileName: originalFileName(req.file.originalname).slice(0, 255),
      mimeType: (req.file.mimetype || 'application/octet-stream').slice(0, 120),
      size: req.file.size,
      storageKey: toStorageKey(req.file.path),
    });
    res.status(201).json({ file: chatFileView(file) });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    throw error;
  }
});

chatFileRoutes.get('/projects/:projectId/chat/files/:fileId/link', async (req, res) => {
  if (!isUuid(req.params.projectId) || !isUuid(req.params.fileId)) throw ApiError.notFound('File not found');
  await assertProjectRole(req.params.projectId, req.user.id);
  const exists = await ChatFile.count({ where: { id: req.params.fileId, projectId: req.params.projectId } });
  if (!exists) throw ApiError.notFound('File not found');
  res.set('Cache-Control', 'no-store');
  res.json({ url: fileLink(req.params.fileId) });
});

export const publicChatFileRoutes = Router();

publicChatFileRoutes.get('/chat-files/:fileId', async (req, res) => {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This link has expired. Open the file again from the chat.');
  }
  if (payload.typ !== TOKEN_TYPES.file || payload.fid !== req.params.fileId) throw ApiError.unauthorized('This link is not valid');
  const file = await ChatFile.findByPk(req.params.fileId);
  if (!file) throw ApiError.notFound('File not found');
  const inline = isInlineMime(file.mimeType);
  res.type(safeResponseMime(file.mimeType));
  res.set('Cache-Control', 'private, max-age=3600');
  if (!inline) res.attachment(file.fileName);
  fs.createReadStream(resolveStoragePath(file.storageKey)).pipe(res);
});
