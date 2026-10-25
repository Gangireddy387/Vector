import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './worklog.controller.js';
import { createWorkLogSchema } from './worklog.validation.js';

const router = Router();

router.get('/issues/:issueId/work-logs', controller.list);
router.post('/issues/:issueId/work-logs', validate({ body: createWorkLogSchema }), controller.create);
router.delete('/work-logs/:workLogId', controller.remove);

export default router;
