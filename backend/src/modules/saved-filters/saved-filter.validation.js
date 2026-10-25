import { z } from 'zod';

const criteria = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const createSavedFilterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  projectId: z.string().uuid().nullable().optional(),
  criteria,
});

export const updateSavedFilterSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  criteria: criteria.optional(),
});
