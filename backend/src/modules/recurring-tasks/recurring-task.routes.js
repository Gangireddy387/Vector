import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './recurring-task.controller.js';
import { createRecurringTaskSchema, updateRecurringTaskSchema } from './recurring-task.validation.js';

const router = Router();
const base = '/projects/:projectId/recurring-tasks';

router.use(base, requireFeature('recurringTasks'));

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('member'), validate({ body: createRecurringTaskSchema }), controller.create);
router.patch(`${base}/:taskId`, requireProjectRole('member'), validate({ body: updateRecurringTaskSchema }), controller.update);
router.delete(`${base}/:taskId`, requireProjectRole('member'), controller.remove);
router.post(`${base}/:taskId/run`, requireProjectRole('member'), controller.runNow);

export default router;
