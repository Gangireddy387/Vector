import { z } from 'zod';

export const rollupQuery = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
});
