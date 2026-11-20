import { z } from 'zod';

export const createWorkLogSchema = z.object({
  minutes: z.number().int().min(1, 'Log at least one minute').max(24 * 60),
  note: z.string().trim().max(500).nullable().optional(),
  loggedAt: z.coerce.date().optional(),
});

export const timerNoteSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');

export const timeReportQuery = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    projectId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'The start date must be before the end date',
    path: ['from'],
  });
