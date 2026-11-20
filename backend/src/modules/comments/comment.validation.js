import { z } from 'zod';
import { COMMENT_REACTION_EMOJIS } from './comment.model.js';

/** Body may be empty when the comment is only file attachments (uploaded right after create). */
export const commentBodySchema = z.object({
  body: z.string().max(20000).default(''),
  parentId: z.string().uuid().nullable().optional(),
});

export const commentReactionSchema = z.object({
  emoji: z.enum(/** @type {[string, ...string[]]} */ (COMMENT_REACTION_EMOJIS)),
});
