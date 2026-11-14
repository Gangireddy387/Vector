import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { CHANNEL_PRIVACY } from './channel.model.js';
import * as channels from './channels.service.js';
import { REACTION_EMOJIS } from './conversation.model.js';
import * as service from './messages.service.js';

const body = z.string().trim().min(1, 'Write a message').max(4000);
const subject = z.string().trim().max(150, 'Keep the subject under 150 characters').nullable().optional();
const messageSchema = z.object({ body, subject });
/** A message can be only files: then the text may be empty. */
const sendSchema = z
  .object({
    body: z.string().trim().max(4000).default(''),
    subject,
    parentId: z.string().uuid().nullable().optional(),
    important: z.boolean().optional(),
    fileIds: z.array(z.string().uuid()).max(10, 'Share up to 10 files at a time').default([]),
  })
  .refine((value) => value.body.length > 0 || value.fileIds.length > 0, { message: 'Write a message', path: ['body'] });
const flagSchema = (key) => z.object({ [key]: z.boolean() });
const messageIdSchema = z.object({ messageId: z.string().uuid() });
const pinSchema = z.object({ pinned: z.boolean() });
const reactionSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });
const directSchema = z.object({ userId: z.string().uuid('Choose someone to message') });
const channelName = z
  .string()
  .trim()
  .min(1, 'Give the channel a name')
  .max(50, 'Keep the name under 50 characters')
  .refine((value) => !/[#<>"\\/]/.test(value), 'Channel names cannot contain # < > " / or \\');
const channelDescription = z.string().trim().max(300).nullable().optional();
const channelSchema = z.object({
  teamId: z.string().uuid('Choose a team'),
  name: channelName,
  description: channelDescription,
  privacy: z.enum(CHANNEL_PRIVACY).default('standard'),
  memberIds: z.array(z.string().uuid()).max(500).optional(),
});
const channelUpdateSchema = z
  .object({ name: channelName.optional(), description: channelDescription })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change');
const membersSchema = z.object({ userIds: z.array(z.string().uuid()).min(1, 'Choose someone to add').max(500) });

/** Direct messages, team/department chats and team channels; each kind only works when the organization's plan includes it. */
const router = Router();
const viewer = (req) => ({ id: req.user.id, name: req.user.name, organization: req.organization, isAdmin: req.organizationRole === 'admin' });

router.get('/conversations', async (req, res) => res.json({ conversations: await service.listConversations(viewer(req)) }));
router.get('/conversations/saved', async (req, res) => res.json({ items: await service.listSaved(viewer(req)) }));
router.post('/conversations/direct', validate({ body: directSchema }), async (req, res) =>
  res.status(201).json({ conversation: await service.openDirect(viewer(req), req.body.userId) }),
);
router.get('/conversations/:conversationId', async (req, res) => res.json(await service.getConversation(viewer(req), req.params.conversationId)));
router.post('/conversations/:conversationId/messages', validate({ body: sendSchema }), async (req, res) =>
  res.status(201).json({ message: await service.sendMessage(viewer(req), req.params.conversationId, req.body) }),
);
router.get('/conversations/:conversationId/people', async (req, res) => res.json({ people: await service.listPeople(viewer(req), req.params.conversationId) }));
router.get('/conversations/:conversationId/files', async (req, res) => res.json({ files: await service.listFiles(viewer(req), req.params.conversationId) }));
router.post('/conversations/:conversationId/unread', validate({ body: messageIdSchema }), async (req, res) =>
  res.json({ conversation: await service.markUnread(viewer(req), req.params.conversationId, req.body.messageId) }),
);
router.post('/conversations/:conversationId/mute', validate({ body: flagSchema('muted') }), async (req, res) =>
  res.json({ conversation: await service.setMuted(viewer(req), req.params.conversationId, req.body.muted) }),
);
router.post('/conversations/:conversationId/messages/:messageId/save', validate({ body: flagSchema('saved') }), async (req, res) =>
  res.json(await service.setSaved(viewer(req), req.params.conversationId, req.params.messageId, req.body.saved)),
);
router.post('/conversations/:conversationId/messages/:messageId/pin', validate({ body: pinSchema }), async (req, res) =>
  res.json({ message: await service.pinMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body.pinned) }),
);
router.post('/conversations/:conversationId/messages/:messageId/reactions', validate({ body: reactionSchema }), async (req, res) =>
  res.json(await service.toggleReaction(viewer(req), req.params.conversationId, req.params.messageId, req.body.emoji)),
);
router.post('/conversations/:conversationId/read', async (req, res) => res.json(await service.markRead(viewer(req), req.params.conversationId)));
router.patch('/conversations/:conversationId/messages/:messageId', validate({ body: messageSchema }), async (req, res) =>
  res.json({ message: await service.editMessage(viewer(req), req.params.conversationId, req.params.messageId, req.body) }),
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

router.post('/channels', validate({ body: channelSchema }), async (req, res) => res.status(201).json({ conversation: await channels.createChannel(viewer(req), req.body) }));
router.patch('/channels/:channelId', validate({ body: channelUpdateSchema }), async (req, res) =>
  res.json({ conversation: await channels.updateChannel(viewer(req), req.params.channelId, req.body) }),
);
router.delete('/channels/:channelId', async (req, res) => {
  await channels.deleteChannel(viewer(req), req.params.channelId);
  res.status(204).end();
});
router.get('/channels/:channelId/members', async (req, res) => res.json(await channels.listMembers(viewer(req), req.params.channelId)));
router.post('/channels/:channelId/members', validate({ body: membersSchema }), async (req, res) =>
  res.json(await channels.addMembers(viewer(req), req.params.channelId, req.body.userIds)),
);
router.delete('/channels/:channelId/members/:userId', async (req, res) => {
  const result = await channels.removeMember(viewer(req), req.params.channelId, req.params.userId);
  if (result) res.json(result);
  else res.status(204).end();
});

export default router;
