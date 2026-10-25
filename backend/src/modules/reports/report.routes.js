import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './report.controller.js';
import { overviewQuery, performanceQuery, summaryQuery } from './report.validation.js';

const router = Router();
const base = '/projects/:projectId/reports';

router.get('/reports/overview', validate({ query: overviewQuery }), controller.overview);
router.get('/reports/performance', validate({ query: performanceQuery }), controller.performance);
router.get('/reports/performance/:userId', validate({ query: performanceQuery }), controller.memberReview);
router.get(`${base}/progress`, requireProjectRole(), controller.progress);
router.get(`${base}/modules`, requireProjectRole(), controller.modules);
router.get(`${base}/sprints`, requireProjectRole(), controller.sprints);
router.get(`${base}/summary`, requireProjectRole(), validate({ query: summaryQuery }), controller.summary);
router.get(`${base}/velocity`, requireProjectRole(), controller.velocity);
router.get(`${base}/sprints/:sprintId/burndown`, requireProjectRole(), controller.burndown);

export default router;
