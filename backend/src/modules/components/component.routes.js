import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './component.controller.js';
import { createComponentSchema, updateComponentSchema } from './component.validation.js';

const router = Router();
const base = '/projects/:projectId/components';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('member'), validate({ body: createComponentSchema }), controller.create);
router.patch(`${base}/:componentId`, requireProjectRole('member'), validate({ body: updateComponentSchema }), controller.update);
router.delete(`${base}/:componentId`, requireProjectRole('admin'), controller.remove);

export default router;
