import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './status.controller.js';
import { createStatusSchema, deleteStatusQuery, reorderStatusesSchema, updateStatusSchema } from './status.validation.js';

const router = Router();
const base = '/projects/:projectId/statuses';

router.get(base, requireProjectRole(), controller.list);
router.post(base, requireProjectRole('admin'), validate({ body: createStatusSchema }), controller.create);
router.put(`${base}/order`, requireProjectRole('admin'), validate({ body: reorderStatusesSchema }), controller.reorder);
router.patch(`${base}/:statusId`, requireProjectRole('admin'), validate({ body: updateStatusSchema }), controller.update);
router.delete(`${base}/:statusId`, requireProjectRole('admin'), validate({ query: deleteStatusQuery }), controller.remove);

export default router;
