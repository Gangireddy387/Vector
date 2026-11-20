import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as controller from './worklog.controller.js';
import { createWorkLogSchema, timeReportQuery, timerNoteSchema } from './worklog.validation.js';

const router = Router();
const timeTracking = requireFeature('timeTracking');

router.get('/issues/:issueId/work-logs', controller.list);
router.post('/issues/:issueId/work-logs', timeTracking, validate({ body: createWorkLogSchema }), controller.create);
router.delete('/work-logs/:workLogId', controller.remove);

router.get('/me/timer', timeTracking, controller.getTimer);
router.post('/issues/:issueId/timer/start', timeTracking, validate({ body: timerNoteSchema }), controller.startTimer);
router.post('/me/timer/stop', timeTracking, validate({ body: timerNoteSchema }), controller.stopTimer);
router.post('/me/timer/discard', timeTracking, controller.discardTimer);

router.get('/time-tracking/report', timeTracking, validate({ query: timeReportQuery }), controller.timeReport);

export default router;
