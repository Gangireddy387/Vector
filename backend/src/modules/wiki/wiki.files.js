import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { isUuid } from '../../shared/utils/ids.js';
import {
  absolutePublicUrl,
  canUseOfficeOnline,
  isInlineMime,
  isOfficeMime,
  officeOnlineEmbedUrl,
  safeResponseMime,
} from '../../shared/utils/preview-mime.js';
import { originalFileName } from '../attachments/attachment.service.js';
import { deleteStoredFile, resolveStoragePath, storage, toStorageKey } from '../attachments/attachment.storage.js';
import { writeThumbnail } from '../attachments/attachment.thumbs.js';
import { signFileToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';
import { requireFeature } from '../plans/plan.service.js';
import { WikiFile, WikiPage } from './wiki.model.js';

const upload = multer({ storage, limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 1 } });
const feature = requireFeature('wiki');

const fileLinkPath = (fileId, variant) => {
  const token = encodeURIComponent(signFileToken(fileId));
  const q = variant === 'thumb' ? '&variant=thumb' : '';
  return `/api/wiki-files/${fileId}?token=${token}${q}`;
};

export const wikiFileView = (file) => {
  const json = file.toJSON ? file.toJSON() : file;
  return {
    id: json.id,
    pageId: json.pageId,
    fileName: json.fileName,
    mimeType: json.mimeType,
    size: json.size,
    hasThumb: Boolean(json.hasThumb ?? file.thumbStorageKey),
    createdAt: json.createdAt,
  };
};

async function loadOrgPage(req, pageId) {
  if (!isUuid(pageId)) throw ApiError.notFound('Page not found');
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: req.organization.id } });
  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

export const wikiFileRoutes = Router();

wikiFileRoutes.get('/wiki/pages/:pageId/files', feature, async (req, res) => {
  const page = await loadOrgPage(req, req.params.pageId);
  const files = await WikiFile.findAll({ where: { pageId: page.id }, order: [['createdAt', 'DESC']] });
  res.json({ files: files.map(wikiFileView) });
});

wikiFileRoutes.post(
  '/wiki/pages/:pageId/files',
  feature,
  requireFeature('attachments'),
  async (req, _res, next) => {
    await loadOrgPage(req, req.params.pageId);
    next();
  },
  upload.single('file'),
  async (req, res) => {
    if (!req.file) throw ApiError.badRequest(`Choose a file of at most ${config.uploads.maxFileSizeMb} MB`);
    const page = await loadOrgPage(req, req.params.pageId);
    try {
      const storageKey = toStorageKey(req.file.path);
      const thumbStorageKey = await writeThumbnail(storageKey, req.file.mimetype);
      const file = await WikiFile.create({
        pageId: page.id,
        organizationId: page.organizationId,
        uploaderId: req.user.id,
        fileName: originalFileName(req.file.originalname).slice(0, 255),
        mimeType: (req.file.mimetype || 'application/octet-stream').slice(0, 120),
        size: req.file.size,
        storageKey,
        thumbStorageKey,
      });
      res.status(201).json({ file: wikiFileView(file) });
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      throw error;
    }
  },
);

wikiFileRoutes.get('/wiki/pages/:pageId/files/:fileId/link', feature, async (req, res) => {
  const page = await loadOrgPage(req, req.params.pageId);
  if (!isUuid(req.params.fileId)) throw ApiError.notFound('File not found');
  const file = await WikiFile.findOne({ where: { id: req.params.fileId, pageId: page.id } });
  if (!file) throw ApiError.notFound('File not found');
  const relative = fileLinkPath(file.id);
  const absolute = absolutePublicUrl(relative);
  res.set('Cache-Control', 'no-store');
  res.json({
    url: relative,
    absoluteUrl: absolute,
    thumbUrl: file.thumbStorageKey ? fileLinkPath(file.id, 'thumb') : null,
    officeEmbedUrl: isOfficeMime(file.mimeType) && canUseOfficeOnline(absolute) ? officeOnlineEmbedUrl(absolute) : null,
  });
});

wikiFileRoutes.delete('/wiki/pages/:pageId/files/:fileId', feature, async (req, res) => {
  const page = await loadOrgPage(req, req.params.pageId);
  if (!isUuid(req.params.fileId)) throw ApiError.notFound('File not found');
  const file = await WikiFile.findOne({ where: { id: req.params.fileId, pageId: page.id } });
  if (!file) throw ApiError.notFound('File not found');
  await file.destroy();
  await deleteStoredFile(file.storageKey);
  if (file.thumbStorageKey) await deleteStoredFile(file.thumbStorageKey);
  res.status(204).end();
});

export const publicWikiFileRoutes = Router();

publicWikiFileRoutes.get('/wiki-files/:fileId', async (req, res) => {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This link has expired. Open the file again from the wiki.');
  }
  if (payload.typ !== TOKEN_TYPES.file || payload.fid !== req.params.fileId) {
    throw ApiError.unauthorized('This link is not valid');
  }
  const file = await WikiFile.findByPk(req.params.fileId);
  if (!file) throw ApiError.notFound('File not found');

  if (req.query.variant === 'thumb') {
    if (!file.thumbStorageKey) throw ApiError.notFound('Thumbnail not found');
    res.type('image/webp');
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${file.fileName}.webp`)}`);
    return res.sendFile(resolveStoragePath(file.thumbStorageKey));
  }

  const inline = isInlineMime(file.mimeType) || isOfficeMime(file.mimeType);
  res.type(safeResponseMime(file.mimeType));
  res.set('Cache-Control', 'private, max-age=3600');
  if (!inline) res.attachment(file.fileName);
  else res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.sendFile(resolveStoragePath(file.storageKey));
});
