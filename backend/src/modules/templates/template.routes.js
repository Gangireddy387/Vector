import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './template.controller.js';
import { createTemplateSchema, updateTemplateSchema } from './template.validation.js';

const router = Router();
const base = '/projects/:projectId/templates';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('member'), validate({ body: createTemplateSchema }), controller.create);
router.patch(`${base}/:templateId`, requireProjectRole('member'), validate({ body: updateTemplateSchema }), controller.update);
router.delete(`${base}/:templateId`, requireProjectRole('member'), controller.remove);

export default router;
