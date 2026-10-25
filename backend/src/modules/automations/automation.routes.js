import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './automation.controller.js';
import { createRuleSchema, updateRuleSchema } from './automation.validation.js';

const router = Router();
const base = '/projects/:projectId/automations';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('admin'), validate({ body: createRuleSchema }), controller.create);
router.patch(`${base}/:ruleId`, requireProjectRole('admin'), validate({ body: updateRuleSchema }), controller.update);
router.delete(`${base}/:ruleId`, requireProjectRole('admin'), controller.remove);

export default router;
