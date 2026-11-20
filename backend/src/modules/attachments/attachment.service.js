import { Op } from 'sequelize';
import { Attachment, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logActivity } from '../activity/activity.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { deleteStoredFile, resolveStoragePath, toStorageKey } from './attachment.storage.js';
import { writeThumbnail } from './attachment.thumbs.js';

const uploaderInclude = [{ model: User, as: 'uploader', attributes: USER_SUMMARY_ATTRIBUTES }];

/** Issue-level files only (comment attachments live under each comment). */
export const listAttachments = (issueId) =>
  Attachment.findAll({
    where: { issueId, commentId: null },
    include: uploaderInclude,
    order: [['createdAt', 'DESC']],
  });

/**
 * The upload library reads file names as Latin-1, which garbles names in other scripts (Telugu, accents, emoji).
 * Re-reading the bytes as UTF-8 restores the name exactly as it was on the person's computer.
 */
export function originalFileName(name) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

async function rowsFromMulter(issueId, uploaderId, files, commentId = null) {
  const rows = [];
  for (const file of files) {
    const storageKey = toStorageKey(file.path);
    const thumbStorageKey = await writeThumbnail(storageKey, file.mimetype);
    rows.push({
      issueId,
      commentId,
      uploaderId,
      fileName: originalFileName(file.originalname),
      mimeType: file.mimetype,
      size: file.size,
      storageKey,
      thumbStorageKey,
    });
  }
  return rows;
}

export async function saveAttachments(issue, uploader, files) {
  if (!files?.length) throw ApiError.badRequest('Choose at least one file');
  const attachments = await Attachment.bulkCreate(await rowsFromMulter(issue.id, uploader.id, files, null));
  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: uploader.id,
    action: 'attached',
    toValue: attachments.map((attachment) => attachment.fileName).join(', '),
  });
  return Attachment.findAll({ where: { id: attachments.map((attachment) => attachment.id) }, include: uploaderInclude });
}

export async function saveCommentAttachments(comment, uploader, files) {
  if (!files?.length) throw ApiError.badRequest('Choose at least one file');
  const created = await Attachment.bulkCreate(await rowsFromMulter(comment.issueId, uploader.id, files, comment.id));
  return Attachment.findAll({ where: { id: created.map((row) => row.id) }, include: uploaderInclude });
}

export async function attachmentsForComments(commentIds) {
  if (!commentIds.length) return new Map();
  const rows = await Attachment.findAll({
    where: { commentId: { [Op.in]: commentIds } },
    include: uploaderInclude,
    order: [['createdAt', 'ASC']],
  });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.commentId) ?? [];
    list.push(row);
    map.set(row.commentId, list);
  }
  return map;
}

async function loadAttachmentWithAccess(attachmentId, userId, minimumRole) {
  const attachment = await Attachment.findByPk(attachmentId, { include: ['issue'] });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  await assertProjectRole(attachment.issue.projectId, userId, minimumRole);
  return attachment;
}

export async function getDownload(attachmentId, userId, { variant } = {}) {
  const attachment = await loadAttachmentWithAccess(attachmentId, userId, 'viewer');
  if (variant === 'thumb') {
    if (!attachment.thumbStorageKey) throw ApiError.notFound('Thumbnail not found');
    return {
      path: resolveStoragePath(attachment.thumbStorageKey),
      fileName: `${attachment.fileName}.webp`,
      mimeType: 'image/webp',
    };
  }
  return { path: resolveStoragePath(attachment.storageKey), fileName: attachment.fileName, mimeType: attachment.mimeType };
}

export async function getAttachmentForLink(attachmentId, userId) {
  return loadAttachmentWithAccess(attachmentId, userId, 'viewer');
}

export async function deleteAttachment(attachmentId, userId) {
  const attachment = await loadAttachmentWithAccess(attachmentId, userId, 'member');
  await attachment.destroy();
  await deleteStoredFile(attachment.storageKey);
  if (attachment.thumbStorageKey) await deleteStoredFile(attachment.thumbStorageKey);
}

/** Used when a comment (and its replies) are removed. */
export async function deleteAttachmentsForComments(commentIds) {
  if (!commentIds.length) return;
  const rows = await Attachment.findAll({ where: { commentId: { [Op.in]: commentIds } }, attributes: ['id', 'storageKey', 'thumbStorageKey'] });
  if (!rows.length) return;
  await Attachment.destroy({ where: { id: rows.map((row) => row.id) } });
  await Promise.all(
    rows.flatMap((row) => {
      const jobs = [deleteStoredFile(row.storageKey)];
      if (row.thumbStorageKey) jobs.push(deleteStoredFile(row.thumbStorageKey));
      return jobs;
    }),
  );
}
