import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './standup.controller.js';
import { draftStandupSchema, saveStandupSchema, standupDayQuery } from './standup.validation.js';

const router = Router();
const base = '/projects/:projectId/standups';

router.use(base, requireFeature('chat'));

router.get(base, requireProjectRole(), validate({ query: standupDayQuery }), controller.day);
/** Anyone with project access (including viewers) can post their own standup. */
router.put(`${base}/me`, requireProjectRole(), validate({ body: saveStandupSchema }), controller.save);
router.delete(`${base}/me`, requireProjectRole(), validate({ query: standupDayQuery }), controller.remove);
router.post(`${base}/draft`, requireProjectRole(), validate({ body: draftStandupSchema }), controller.draft);

export default router;
