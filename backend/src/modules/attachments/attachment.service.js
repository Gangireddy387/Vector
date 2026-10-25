import { Attachment, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logActivity } from '../activity/activity.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { deleteStoredFile, resolveStoragePath, toStorageKey } from './attachment.storage.js';

const uploaderInclude = [{ model: User, as: 'uploader', attributes: USER_SUMMARY_ATTRIBUTES }];

export const listAttachments = (issueId) =>
  Attachment.findAll({ where: { issueId }, include: uploaderInclude, order: [['createdAt', 'DESC']] });

export async function saveAttachments(issue, uploader, files) {
  if (!files?.length) throw ApiError.badRequest('Choose at least one file');
  const attachments = await Attachment.bulkCreate(
    files.map((file) => ({
      issueId: issue.id,
      uploaderId: uploader.id,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageKey: toStorageKey(file.path),
    })),
  );
  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: uploader.id,
    action: 'attached',
    toValue: attachments.map((attachment) => attachment.fileName).join(', '),
  });
  return Attachment.findAll({ where: { id: attachments.map((attachment) => attachment.id) }, include: uploaderInclude });
}

async function loadAttachmentWithAccess(attachmentId, userId, minimumRole) {
  const attachment = await Attachment.findByPk(attachmentId, { include: ['issue'] });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  await assertProjectRole(attachment.issue.projectId, userId, minimumRole);
  return attachment;
}

export async function getDownload(attachmentId, userId) {
  const attachment = await loadAttachmentWithAccess(attachmentId, userId, 'viewer');
  return { path: resolveStoragePath(attachment.storageKey), fileName: attachment.fileName, mimeType: attachment.mimeType };
}

export async function deleteAttachment(attachmentId, userId) {
  const attachment = await loadAttachmentWithAccess(attachmentId, userId, 'member');
  await attachment.destroy();
  await deleteStoredFile(attachment.storageKey);
}
