import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './standup.controller.js';
import { draftStandupSchema, saveStandupSchema, standupDayQuery } from './standup.validation.js';

const router = Router();
const base = '/projects/:projectId/standups';

router.get(base, requireProjectRole(), validate({ query: standupDayQuery }), controller.day);
router.put(`${base}/me`, requireProjectRole('member'), validate({ body: saveStandupSchema }), controller.save);
router.delete(`${base}/me`, requireProjectRole('member'), validate({ query: standupDayQuery }), controller.remove);
router.post(`${base}/draft`, requireProjectRole('member'), validate({ body: draftStandupSchema }), controller.draft);

export default router;
