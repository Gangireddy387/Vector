import { Router } from 'express';
import { requireFeature } from '../plans/plan.service.js';
import { requireIssueRole } from '../projects/project-access.js';
import * as controller from './attachment.controller.js';
import { uploadMiddleware } from './attachment.storage.js';

const router = Router();

router.get('/issues/:issueId/attachments', requireIssueRole(), controller.list);
// Existing files stay downloadable on any plan; only new uploads need the feature.
router.post(
  '/issues/:issueId/attachments',
  requireFeature('attachments'),
  requireIssueRole('member'),
  uploadMiddleware.array('files', 10),
  controller.upload,
);
router.post(
  '/comments/:commentId/attachments',
  requireFeature('attachments'),
  uploadMiddleware.array('files', 10),
  controller.uploadForComment,
);
router.get('/attachments/:attachmentId/link', controller.link);
router.get('/attachments/:attachmentId/download', controller.download);
router.delete('/attachments/:attachmentId', controller.remove);

export default router;

export const publicAttachmentFileRoutes = Router();
publicAttachmentFileRoutes.get('/attachment-files/:attachmentId', controller.servePublicAttachment);
