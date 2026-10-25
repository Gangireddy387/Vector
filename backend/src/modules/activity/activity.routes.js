import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './activity.controller.js';
import { activityListQuery } from './activity.validation.js';

const router = Router();

router.get('/projects/:projectId/activity', requireProjectRole(), validate({ query: activityListQuery }), controller.listForProject);
router.get('/issues/:issueId/activity', controller.listForIssue);

export default router;
