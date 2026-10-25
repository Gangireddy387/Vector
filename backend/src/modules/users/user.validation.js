import { z } from 'zod';

export const searchUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  projectId: z.string().uuid().optional(),
});
