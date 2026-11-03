import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole, requireSprintManager } from '../projects/project-access.js';
import * as controller from './sprint.controller.js';
import { completeSprintSchema, createSprintSchema, startSprintSchema, updateSprintSchema } from './sprint.validation.js';

const router = Router();
const base = '/projects/:projectId/sprints';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireSprintManager, validate({ body: createSprintSchema }), controller.create);
router.patch(`${base}/:sprintId`, requireSprintManager, validate({ body: updateSprintSchema }), controller.update);
router.post(`${base}/:sprintId/start`, requireSprintManager, validate({ body: startSprintSchema }), controller.start);
router.post(`${base}/:sprintId/complete`, requireSprintManager, validate({ body: completeSprintSchema }), controller.complete);
router.delete(`${base}/:sprintId`, requireProjectRole('admin'), controller.remove);

export default router;
