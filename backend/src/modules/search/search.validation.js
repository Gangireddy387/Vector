import { z } from 'zod';

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  /** Narrow results when the full-page search uses tabs. */
  scope: z.enum(['all', 'issues', 'projects', 'people']).default('all'),
});
