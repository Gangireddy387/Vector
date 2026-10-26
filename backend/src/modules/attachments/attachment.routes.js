import { Router } from 'express';
import { requireFeature } from '../plans/plan.service.js';
import { requireIssueRole } from '../projects/project-access.js';
import * as controller from './attachment.controller.js';
import { uploadMiddleware } from './attachment.storage.js';

const router = Router();

router.get('/issues/:issueId/attachments', requireIssueRole(), controller.list);
// Existing files stay downloadable on any plan; only new uploads need the feature.
router.post('/issues/:issueId/attachments', requireFeature('attachments'), requireIssueRole('member'), uploadMiddleware.array('files', 10), controller.upload);
router.get('/attachments/:attachmentId/download', controller.download);
router.delete('/attachments/:attachmentId', controller.remove);

export default router;
