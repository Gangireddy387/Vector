import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as controller from './ai.controller.js';
import { draftIssueSchema } from './ai.validation.js';

const router = Router();
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const aiFeature = requireFeature('aiAssistant');

router.get('/ai/status', controller.status);
router.post('/ai/draft-issue', aiFeature, aiLimiter, validate({ body: draftIssueSchema }), controller.draftIssue);
router.post('/ai/issues/:issueId/summary', aiFeature, aiLimiter, controller.summarize);
router.post('/ai/issues/:issueId/breakdown', aiFeature, aiLimiter, controller.breakdown);

export default router;
