import { z } from 'zod';
import { CHAT_REACTION_EMOJIS } from './chat.model.js';

export const messageBodySchema = z
  .object({
    body: z.string().trim().max(4000).optional().default(''),
    parentId: z.string().uuid().nullable().optional(),
    fileIds: z.array(z.string().uuid()).max(10).optional().default([]),
  })
  .refine((value) => Boolean(value.body?.trim()) || value.fileIds.length > 0, { message: 'Write a message or attach a file', path: ['body'] });

export const listMessagesQuery = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const chatMessageParams = z.object({ messageId: z.string().uuid() });

export const reactionSchema = z.object({ emoji: z.enum(CHAT_REACTION_EMOJIS) });
