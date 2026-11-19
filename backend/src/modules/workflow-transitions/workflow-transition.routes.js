import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './workflow-transition.controller.js';
import { replaceTransitionRulesSchema } from './workflow-transition.validation.js';

const router = Router();
const base = '/projects/:projectId/workflow-transitions';

router.get(base, requireProjectRole(), controller.list);
router.put(base, requireProjectRole('admin'), validate({ body: replaceTransitionRulesSchema }), controller.replace);

export default router;
