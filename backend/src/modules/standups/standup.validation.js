import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');
const section = z.string().max(4000).optional().nullable();

export const standupDayQuery = z.object({
  date: dateOnly,
  /** How many calendar days of posting history to include (for the trend chart). */
  days: z.coerce.number().int().min(7).max(90).optional().default(30),
});

export const saveStandupSchema = z
  .object({
    date: dateOnly,
    yesterday: section,
    today: section,
    blockers: section,
    /** Explicit empty day (e.g. time off) instead of leaving every section blank by accident. */
    skipped: z.boolean().optional(),
  })
  .refine(
    (body) => {
      if (body.skipped) return true;
      return [body.yesterday, body.today, body.blockers].some((value) => typeof value === 'string' && value.trim());
    },
    { message: 'Write at least one section, or mark the standup as skipped', path: ['today'] },
  );

export const draftStandupSchema = z.object({ date: dateOnly.optional() });
