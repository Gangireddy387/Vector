import { Attachment, Comment } from '../../database/models.js';
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
import { signFileToken, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';
import { loadIssueWithAccess } from '../projects/project-access.js';
import * as attachmentService from './attachment.service.js';
import { resolveStoragePath } from './attachment.storage.js';

export const list = async (req, res) => res.json({ attachments: await attachmentService.listAttachments(req.issue.id) });

export const upload = async (req, res) =>
  res.status(201).json({ attachments: await attachmentService.saveAttachments(req.issue, req.user, req.files) });

export const uploadForComment = async (req, res) => {
  if (!isUuid(req.params.commentId)) throw ApiError.notFound('Comment not found');
  const comment = await Comment.findByPk(req.params.commentId, { include: ['issue'] });
  if (!comment) throw ApiError.notFound('Comment not found');
  await loadIssueWithAccess(comment.issueId, req.user.id, 'member');
  res.status(201).json({ attachments: await attachmentService.saveCommentAttachments(comment, req.user, req.files) });
};

const fileLinkPath = (attachmentId, variant) => {
  const token = encodeURIComponent(signFileToken(attachmentId));
  const q = variant === 'thumb' ? `&variant=thumb` : '';
  return `/api/attachment-files/${attachmentId}?token=${token}${q}`;
};

export const link = async (req, res) => {
  const attachment = await attachmentService.getAttachmentForLink(req.params.attachmentId, req.user.id);
  const relative = fileLinkPath(attachment.id);
  const absolute = absolutePublicUrl(relative);
  const thumbRelative = attachment.thumbStorageKey ? fileLinkPath(attachment.id, 'thumb') : null;
  res.set('Cache-Control', 'no-store');
  res.json({
    url: relative,
    absoluteUrl: absolute,
    thumbUrl: thumbRelative,
    officeEmbedUrl:
      isOfficeMime(attachment.mimeType) && canUseOfficeOnline(absolute) ? officeOnlineEmbedUrl(absolute) : null,
  });
};

export const download = async (req, res) => {
  const variant = req.query.variant === 'thumb' ? 'thumb' : undefined;
  const file = await attachmentService.getDownload(req.params.attachmentId, req.user.id, { variant });
  res.type(safeResponseMime(file.mimeType));
  const wantInline = req.query.inline === '1' || req.query.inline === 'true' || variant === 'thumb';
  if (wantInline && (variant === 'thumb' || isInlineMime(file.mimeType))) {
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return res.sendFile(file.path);
  }
  res.download(file.path, file.fileName);
};

export const remove = async (req, res) => {
  await attachmentService.deleteAttachment(req.params.attachmentId, req.user.id);
  res.status(204).end();
};

/** Public short-lived file host (thumbs + full files for lightbox / Office Online). */
export async function servePublicAttachment(req, res) {
  let payload;
  try {
    payload = verifyAccessToken(String(req.query.token ?? ''));
  } catch {
    throw ApiError.unauthorized('This link has expired. Open the file again.');
  }
  if (payload.typ !== TOKEN_TYPES.file || payload.fid !== req.params.attachmentId) {
    throw ApiError.unauthorized('This link is not valid');
  }
  const attachment = await Attachment.findByPk(req.params.attachmentId);
  if (!attachment) throw ApiError.notFound('File not found');

  const wantThumb = req.query.variant === 'thumb';
  if (wantThumb) {
    if (!attachment.thumbStorageKey) throw ApiError.notFound('Thumbnail not found');
    res.type('image/webp');
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${attachment.fileName}.webp`)}`);
    return res.sendFile(resolveStoragePath(attachment.thumbStorageKey));
  }

  const inline = isInlineMime(attachment.mimeType) || isOfficeMime(attachment.mimeType);
  res.type(safeResponseMime(attachment.mimeType));
  res.set('Cache-Control', 'private, max-age=3600');
  if (!inline) res.attachment(attachment.fileName);
  else res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
  res.sendFile(resolveStoragePath(attachment.storageKey));
}
