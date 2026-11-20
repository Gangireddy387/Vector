import { z } from 'zod';
import { COMMENT_REACTION_EMOJIS } from './comment.model.js';

export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(20000),
  parentId: z.string().uuid().nullable().optional(),
});

export const commentReactionSchema = z.object({
  emoji: z.enum(/** @type {[string, ...string[]]} */ (COMMENT_REACTION_EMOJIS)),
});
