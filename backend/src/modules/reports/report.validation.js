import { z } from 'zod';

export const summaryQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');

export const overviewQuery = z
  .object({
    projectId: z.string().trim().optional(),
    days: z.coerce.number().int().min(7).max(180).default(30),
    assigneeId: z.string().trim().optional(),
    type: z.string().trim().optional(),
    priority: z.string().trim().optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'The start date must be before the end date', path: ['from'] });

export const performanceQuery = z
  .object({ projectId: z.string().trim().optional(), from: dateOnly.optional(), to: dateOnly.optional() })
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'The start date must be before the end date', path: ['from'] });

/** Open work vs weekly capacity for staffing. */
export const capacityQuery = z.object({
  projectId: z.string().trim().optional(),
  /** How many weeks of capacity to compare open load against (default 2). */
  horizonWeeks: z.coerce.number().int().min(1).max(8).default(2),
  /** Override org weekly capacity for this view (minutes). */
  minutesPerWeek: z.coerce.number().int().min(60).max(10080).optional(),
});
