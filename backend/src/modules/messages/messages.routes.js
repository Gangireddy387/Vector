import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../shared/middleware/validate.js';
import * as channels from './channels.service.js';
import * as collab from './conversation-collab.service.js';
import * as service from './messages.service.js';
import {
  approvalDecisionSchema,
  approvalParams,
  approvalSchema,
  channelMemberParams,
  channelParams,
  channelSchema,
  channelUpdateSchema,
  conversationParams,
  directSchema,
  docParams,
  docSchema,
  docUpdateSchema,
  editMessageSchema,
  flagSchema,
  forwardSchema,
  getConversationQuery,
  membersSchema,
  messageIdBodySchema,
  messageParams,
  muteSchema,
  pinSchema,
  pollParams,
  pollSchema,
  reactionSchema,
  searchMessagesQuery,
  sendSchema,
  voteSchema,
} from './messages.validation.js';

/** Direct messages, team/department chats and team channels; each kind only works when the organization's plan includes it. */
const router = Router();
const viewer = (req) => ({ id: req.user.id, name: req.user.name, organization: req.organization, isAdmin: req.organizationRole === 'admin' });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false });
const reactionLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

router.get('/conversations', async (req, res) => res.json({ conversations: await service.listConversations(viewer(req)) }));
router.get('/conversations/saved', async (req, res) => res.json({ items: await service.listSaved(viewer(req)) }));
router.get('/messages/search', validate({ query: searchMessagesQuery }), async (req, res) =>
  res.json(await service.searchAllMessages(viewer(req), req.filters)),
);
router.post('/conversations/direct', validate({ body: directSchema }), async (req, res) =>
  res.status(201).json({ conversation: await service.openDirect(viewer(req), req.body.userId) }),
);
router.get('/conversations/:conversationId', validate({ params: conversationParams, query: getConversationQuery }), async (req, res) =>
  res.json(await service.getConversation(viewer(req), req.params.conversationId, req.filters ?? {})),
);
router.get(
  '/conversations/:conversationId/messages/search',
  validate({ params: conversationParams, query: searchMessagesQuery }),
  async (req, res) => res.json(await service.searchMessages(viewer(req), req.params.conversationId, req.filters)),
);
router.post('/conversations/:conversationId/messages', messageLimiter, validate({ params: conversationParams, body: sendSchema }), async (req, res) =>
  res.status(201).json({ message: await service.sendMessage(viewer(req), req.params.conversationId, req.body) }),
);
router.get('/conversations/:conversationId/people', validate({ params: conversationParams }), async (req, res) =>
  res.json({ people: await service.listPeople(viewer(req), req.params.conversationId) }),
);
router.get('/conversations/:conversationId/files', validate({ params: conversationParams }), async (req, res) =>
  res.json({ files: await service.listFiles(viewer(req), req.params.conversationId) }),
);
router.get('/conversations/:conversationId/docs', validate({ params: conversationParams }), async (req, res) =>
  res.json({ docs: await collab.listDocs(viewer(req), req.params.conversationId) }),
);
router.post('/conversations/:conversationId/docs', validate({ params: conversationParams, body: docSchema }), async (req, res) =>
  res.status(201).json({ doc: await collab.createDoc(viewer(req), req.params.conversationId, req.body) }),
);
router.patch('/conversations/:conversationId/docs/:docId', validate({ params: docParams, body: docUpdateSchema }), async (req, res) =>
  res.json({ doc: await collab.updateDoc(viewer(req), req.params.conversationId, req.params.docId, req.body) }),
);
router.delete('/conversations/:conversationId/docs/:docId', validate({ params: docParams }), async (req, res) => {
  await collab.deleteDoc(viewer(req), req.params.conversationId, req.params.docId);
  res.status(204).end();
});
router.post('/conversations/:conversationId/polls', messageLimiter, validate({ params: conversationParams, body: pollSchema }), async (req, res) =>
  res.status(201).json({ message: await collab.createPoll(viewer(req), req.params.conversationId, req.body) }),
);
router.post('/conversations/:conversationId/polls/:pollId/vote', reactionLimiter, validate({ params: pollParams, body: voteSchema }), async (req, res) =>
  res.json({ message: await collab.votePoll(viewer(req), req.params.conversationId, req.params.pollId, req.body.optionIndex) }),
);
router.post('/conversations/:conversationId/polls/:pollId/close', validate({ params: pollParams }), async (req, res) =>
  res.json({ message: await collab.closePoll(viewer(req), req.params.conversationId, req.params.pollId) }),
);
router.post('/conversations/:conversationId/approvals', messageLimiter, validate({ params: conversationParams, body: approvalSchema }), async (req, res) =>
  res.status(201).json({ message: await collab.createApproval(viewer(req), req.params.conversationId, req.body) }),
);
router.post(
  '/conversations/:conversationId/approvals/:approvalId/respond',
  validate({ params: approvalParams, body: approvalDecisionSchema }),
  async (req, res) => res.json({ message: await collab.respondApproval(viewer(req), req.params.conversationId, req.params.approvalId, req.body.decision) }),
);
router.post('/conversations/:conversationId/unread', validate({ params: conversationParams, body: messageIdBodySchema }), async (req, res) =>
  res.json({ conversation: await service.markUnread(viewer(req), req.params.conversationId, req.body.messageId) }),
);
router.post('/conversations/:conversationId/mute', validate({ params: conversationParams, body: muteSchema }), async (req, res) =>
  res.json({ conversation: await service.setNotifyLevel(viewer(req), req.params.conversationId, req.body) }),
);
router.post(
  '/conversations/:conversationId/messages/:messageId/forward',
  messageLimiter,
  validate({ params: messageParams, body: forwardSchema }),
  async (req, res) => res.status(201).json({ message: await service.forwardMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body) }),
);
router.get('/conversations/:conversationId/messages/:messageId/history', validate({ params: messageParams }), async (req, res) =>
  res.json({ revisions: await service.listMessageHistory(viewer(req), req.params.conversationId, req.params.messageId) }),
);
router.post(
  '/conversations/:conversationId/messages/:messageId/save',
  validate({ params: messageParams, body: flagSchema('saved') }),
  async (req, res) => res.json(await service.setSaved(viewer(req), req.params.conversationId, req.params.messageId, req.body.saved)),
);
router.post('/conversations/:conversationId/messages/:messageId/pin', validate({ params: messageParams, body: pinSchema }), async (req, res) =>
  res.json({ message: await service.pinMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body.pinned) }),
);
router.post(
  '/conversations/:conversationId/messages/:messageId/reactions',
  reactionLimiter,
  validate({ params: messageParams, body: reactionSchema }),
  async (req, res) => res.json(await service.toggleReaction(viewer(req), req.params.conversationId, req.params.messageId, req.body.emoji)),
);
router.post('/conversations/:conversationId/read', validate({ params: conversationParams }), async (req, res) =>
  res.json(await service.markRead(viewer(req), req.params.conversationId)),
);
router.patch(
  '/conversations/:conversationId/messages/:messageId',
  validate({ params: messageParams, body: editMessageSchema }),
  async (req, res) => res.json({ message: await service.editMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body) }),
);
router.delete('/conversations/:conversationId/messages/:messageId', validate({ params: messageParams }), async (req, res) =>
  res.json({ message: await service.deleteMessage(viewer(req), req.params.conversationId, req.params.messageId) }),
);
router.post('/conversations/:conversationId/messages/:messageId/hide', validate({ params: messageParams }), async (req, res) =>
  res.json({ conversation: await service.hideMessage(viewer(req), req.params.conversationId, req.params.messageId) }),
);
router.post('/conversations/:conversationId/clear', validate({ params: conversationParams }), async (req, res) =>
  res.json({ conversation: await service.clearConversation(viewer(req), req.params.conversationId) }),
);

router.post('/channels', validate({ body: channelSchema }), async (req, res) => res.status(201).json({ conversation: await channels.createChannel(viewer(req), req.body) }));
router.patch('/channels/:channelId', validate({ params: channelParams, body: channelUpdateSchema }), async (req, res) =>
  res.json({ conversation: await channels.updateChannel(viewer(req), req.params.channelId, req.body) }),
);
router.delete('/channels/:channelId', validate({ params: channelParams }), async (req, res) => {
  await channels.deleteChannel(viewer(req), req.params.channelId);
  res.status(204).end();
});
router.get('/channels/:channelId/members', validate({ params: channelParams }), async (req, res) =>
  res.json(await channels.listMembers(viewer(req), req.params.channelId)),
);
router.post('/channels/:channelId/members', validate({ params: channelParams, body: membersSchema }), async (req, res) =>
  res.json(await channels.addMembers(viewer(req), req.params.channelId, req.body.userIds)),
);
router.delete('/channels/:channelId/members/:userId', validate({ params: channelMemberParams }), async (req, res) => {
  const result = await channels.removeMember(viewer(req), req.params.channelId, req.params.userId);
  if (result) res.json(result);
  else res.status(204).end();
});

export default router;
