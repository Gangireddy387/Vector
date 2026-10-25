import { z } from 'zod';

export const createWorkLogSchema = z.object({
  minutes: z.number().int().min(1, 'Log at least one minute').max(24 * 60),
  note: z.string().trim().max(500).nullable().optional(),
  loggedAt: z.coerce.date().optional(),
});
