import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/middleware/validate.js';
import { requireIssueRole, requireProjectRole } from '../projects/project-access.js';
import * as controller from './chat.controller.js';
import { listMessagesQuery, messageBodySchema } from './chat.validation.js';

const router = Router();
const base = '/projects/:projectId/chat/messages';
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.get(base, requireProjectRole(), validate({ query: listMessagesQuery }), controller.list);
router.post(base, chatLimiter, requireProjectRole(), validate({ body: messageBodySchema }), controller.create);
router.patch('/chat/messages/:messageId', validate({ body: messageBodySchema }), controller.update);
router.delete('/chat/messages/:messageId', controller.remove);
router.get('/issues/:issueId/followups', requireIssueRole(), controller.followups);

export default router;
