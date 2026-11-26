import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireIssueRole, requireProjectRole } from '../projects/project-access.js';
import * as controller from './chat.controller.js';
import { chatFileRoutes } from './chat.files.js';
import { chatMessageParams, listMessagesQuery, messageBodySchema, reactionSchema } from './chat.validation.js';

const router = Router();
const base = '/projects/:projectId/chat/messages';
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const editBodySchema = z.object({ body: z.string().trim().min(1, 'Write a message first').max(4000) });

router.use([base, '/chat/messages', '/projects/:projectId/chat/files'], requireFeature('chat'));
router.use(chatFileRoutes);

router.get(base, requireProjectRole(), validate({ query: listMessagesQuery }), controller.list);
/** Posting is for members+; viewers can still read the thread. */
router.post(base, chatLimiter, requireProjectRole('member'), validate({ body: messageBodySchema }), controller.create);
/** Project admins can wipe the whole Work chat for everyone. */
router.delete(base, requireProjectRole('admin'), controller.clear);
router.patch('/chat/messages/:messageId', validate({ params: chatMessageParams, body: editBodySchema }), controller.update);
router.delete('/chat/messages/:messageId', validate({ params: chatMessageParams }), controller.remove);
router.post('/chat/messages/:messageId/reactions', validate({ params: chatMessageParams, body: reactionSchema }), controller.react);
router.get('/issues/:issueId/followups', requireFeature('chat'), requireIssueRole(), controller.followups);

export default router;
