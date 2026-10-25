import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './label.controller.js';
import { createLabelSchema, updateLabelSchema } from './label.validation.js';

const router = Router();
const base = '/projects/:projectId/labels';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('member'), validate({ body: createLabelSchema }), controller.create);
router.patch(`${base}/:labelId`, requireProjectRole('member'), validate({ body: updateLabelSchema }), controller.update);
router.delete(`${base}/:labelId`, requireProjectRole('admin'), controller.remove);

export default router;
