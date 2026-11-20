import { z } from 'zod';

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  /** Narrow results when the full-page search uses tabs. */
  scope: z.enum(['all', 'issues', 'projects', 'people', 'messages', 'chat', 'wiki']).default('all'),
});
