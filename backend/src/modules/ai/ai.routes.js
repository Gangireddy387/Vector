import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as controller from './ai.controller.js';
import { draftIssueSchema, issueRefParams, writingAssistSchema, writingSuggestSchema } from './ai.validation.js';

const router = Router();
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const writingLimiter = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

const aiFeature = requireFeature('aiAssistant');

router.get('/ai/status', controller.status);
router.get('/ai/daily-briefing', aiFeature, aiLimiter, controller.dailyBriefing);
router.post('/ai/draft-issue', aiFeature, aiLimiter, validate({ body: draftIssueSchema }), controller.draftIssue);
router.post('/ai/issues/:issueId/summary', aiFeature, aiLimiter, validate({ params: issueRefParams }), controller.summarize);
router.post('/ai/issues/:issueId/breakdown', aiFeature, aiLimiter, validate({ params: issueRefParams }), controller.breakdown);
router.post('/ai/issues/:issueId/next-action', aiFeature, aiLimiter, validate({ params: issueRefParams }), controller.nextAction);
router.post('/ai/writing/assist', aiFeature, writingLimiter, validate({ body: writingAssistSchema }), controller.writingAssist);
router.post('/ai/writing/suggest', aiFeature, writingLimiter, validate({ body: writingSuggestSchema }), controller.writingSuggest);

export default router;
