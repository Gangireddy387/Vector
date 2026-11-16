import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');
const section = z.string().max(4000).optional().nullable();

export const standupDayQuery = z.object({
  date: dateOnly,
  /** How many calendar days of posting history to include (for the trend chart). */
  days: z.coerce.number().int().min(7).max(90).optional().default(30),
});

export const saveStandupSchema = z.object({ date: dateOnly, yesterday: section, today: section, blockers: section });

export const draftStandupSchema = z.object({ date: dateOnly.optional() });
