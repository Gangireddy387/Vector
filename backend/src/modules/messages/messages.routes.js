import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import * as service from './messages.service.js';

const messageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });
const directSchema = z.object({ userId: z.string().uuid('Choose someone to message') });

/** Direct messages and team/department chats; each kind only works when the organization's plan includes it. */
const router = Router();
const viewer = (req) => ({ id: req.user.id, organization: req.organization, isAdmin: req.organizationRole === 'admin' });

router.get('/conversations', async (req, res) => res.json({ conversations: await service.listConversations(viewer(req)) }));
router.post('/conversations/direct', validate({ body: directSchema }), async (req, res) =>
  res.status(201).json({ conversation: await service.openDirect(viewer(req), req.body.userId) }),
);
router.get('/conversations/:conversationId', async (req, res) => res.json(await service.getConversation(viewer(req), req.params.conversationId)));
router.post('/conversations/:conversationId/messages', validate({ body: messageSchema }), async (req, res) =>
  res.status(201).json({ message: await service.sendMessage(viewer(req), req.params.conversationId, req.body.body) }),
);
router.post('/conversations/:conversationId/read', async (req, res) => res.json(await service.markRead(viewer(req), req.params.conversationId)));
router.patch('/conversations/:conversationId/messages/:messageId', validate({ body: messageSchema }), async (req, res) =>
  res.json({ message: await service.editMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body.body) }),
);
router.delete('/conversations/:conversationId/messages/:messageId', async (req, res) =>
  res.json({ message: await service.deleteMessage(viewer(req), req.params.conversationId, req.params.messageId) }),
);
router.post('/conversations/:conversationId/messages/:messageId/hide', async (req, res) =>
  res.json({ conversation: await service.hideMessage(viewer(req), req.params.conversationId, req.params.messageId) }),
);
router.post('/conversations/:conversationId/clear', async (req, res) =>
  res.json({ conversation: await service.clearConversation(viewer(req), req.params.conversationId) }),
);

export default router;
