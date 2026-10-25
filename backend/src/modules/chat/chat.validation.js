import { z } from 'zod';

export const messageBodySchema = z.object({ body: z.string().trim().min(1, 'Write a message first').max(4000) });

export const listMessagesQuery = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
