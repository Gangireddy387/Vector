import { z } from 'zod';
import { CHANNEL_PRIVACY } from './channel.model.js';
import { NOTIFY_LEVELS, REACTION_EMOJIS } from './conversation.model.js';

const uuid = z.string().uuid();

export const conversationParams = z.object({ conversationId: uuid });
export const messageParams = z.object({ conversationId: uuid, messageId: uuid });
export const channelParams = z.object({ channelId: uuid });
export const channelMemberParams = z.object({ channelId: uuid, userId: uuid });
export const docParams = z.object({ conversationId: uuid, docId: uuid });
export const pollParams = z.object({ conversationId: uuid, pollId: uuid });
export const approvalParams = z.object({ conversationId: uuid, approvalId: uuid });

export const getConversationQuery = z.object({
  /** Load older messages than this ISO timestamp (DM threads and channel posts). */
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchMessagesQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const subject = z.string().trim().max(150, 'Keep the subject under 150 characters').nullable().optional();

/** A message can be only files: then the text may be empty. */
export const sendSchema = z
  .object({
    body: z.string().trim().max(4000).default(''),
    subject,
    parentId: uuid.nullable().optional(),
    important: z.boolean().optional(),
    fileIds: z.array(uuid).max(10, 'Share up to 10 files at a time').default([]),
  })
  .refine((value) => value.body.length > 0 || value.fileIds.length > 0, { message: 'Write a message', path: ['body'] });

/** Edit keeps text optional so a file-only message can stay with an empty body. */
export const editMessageSchema = z.object({
  body: z.string().trim().max(4000),
  subject,
});

export const muteSchema = z
  .object({
    notifyLevel: z.enum(NOTIFY_LEVELS).optional(),
    muted: z.boolean().optional(),
  })
  .refine((value) => value.notifyLevel != null || value.muted != null, { message: 'Choose a notification level' });

export const forwardSchema = z.object({
  targetConversationId: uuid,
  note: z.string().trim().max(1000).optional(),
});

export const messageIdBodySchema = z.object({ messageId: uuid });
export const pinSchema = z.object({ pinned: z.boolean() });
export const reactionSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });
export const flagSchema = (key) => z.object({ [key]: z.boolean() });
export const directSchema = z.object({ userId: uuid });

const channelName = z
  .string()
  .trim()
  .min(1, 'Give the channel a name')
  .max(50, 'Keep the name under 50 characters')
  .refine((value) => !/[#<>"\\/]/.test(value), 'Channel names cannot contain # < > " / or \\');
const channelDescription = z.string().trim().max(300).nullable().optional();

export const channelSchema = z.object({
  teamId: uuid,
  name: channelName,
  description: channelDescription,
  privacy: z.enum(CHANNEL_PRIVACY).default('standard'),
  memberIds: z.array(uuid).max(500).optional(),
});

export const channelUpdateSchema = z
  .object({ name: channelName.optional(), description: channelDescription })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change');

export const membersSchema = z.object({ userIds: z.array(uuid).min(1, 'Choose someone to add').max(500) });

export const docSchema = z.object({
  title: z.string().trim().min(1, 'Give the doc a title').max(150),
  body: z.string().max(50_000).optional(),
});

export const docUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().max(50_000).optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, { message: 'Provide a change' });

export const pollSchema = z.object({
  question: z.string().trim().min(1, 'Ask a question').max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
  subject: z.string().trim().max(150).nullable().optional(),
});

export const voteSchema = z.object({ optionIndex: z.number().int().min(0).max(5) });

export const approvalSchema = z.object({
  title: z.string().trim().min(1, 'Give the approval a title').max(150),
  body: z.string().trim().max(4000).optional(),
});

export const approvalDecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']) });
