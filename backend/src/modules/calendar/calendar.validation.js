import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_STATUSES } from './calendar-event.model.js';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:mm format').nullable().optional();
const uuid = z.string().uuid();

const eventFields = {
  title: z.string().trim().min(2, 'The title needs at least 2 characters').max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  date: dateOnly,
  allDay: z.boolean().optional(),
  startTime: time,
  endTime: time,
  category: z.enum(EVENT_CATEGORIES).optional(),
  location: z.string().trim().max(300).nullable().optional(),
  projectId: z.string().uuid('Choose a project from the list').nullable().optional(),
};

/** All-day clears times; timed events need a start and an end after it. */
const withScheduleRules = (schema) =>
  schema
    .superRefine((value, ctx) => {
      if (value.allDay) return;
      if (value.allDay === false || value.startTime != null || value.endTime != null) {
        if (!value.startTime) ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Choose a start time, or mark the event as all day' });
        if (!value.endTime) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Choose an end time' });
        if (value.startTime && value.endTime && value.endTime <= value.startTime) {
          ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The event must end after it starts' });
        }
      }
    })
    .transform((value) => (value.allDay ? { ...value, startTime: null, endTime: null } : value));

export const eventIdParams = z.object({ eventId: uuid });

export const listEventsQuery = z
  .object({ from: dateOnly, to: dateOnly })
  .refine((query) => query.from <= query.to, { message: 'The start date must be before the end date', path: ['from'] });

export const listTeamEventsQuery = z
  .object({
    teamId: uuid,
    from: dateOnly,
    to: dateOnly,
    projectId: uuid.optional(),
    /** Comma-separated: meeting,due,other (default all three). */
    kinds: z
      .string()
      .trim()
      .optional()
      .transform((value) => {
        if (!value) return ['meeting', 'due', 'other'];
        const allowed = new Set(['meeting', 'due', 'other']);
        const parts = value
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter((part) => allowed.has(part));
        return parts.length ? [...new Set(parts)] : ['meeting', 'due', 'other'];
      }),
  })
  .refine((query) => query.from <= query.to, { message: 'The start date must be before the end date', path: ['from'] });

export const createEventSchema = withScheduleRules(
  z.object({
    ...eventFields,
    repeat: z
      .object({ frequency: z.enum(['daily', 'weekdays', 'weekly']), until: dateOnly })
      .nullable()
      .optional(),
  }),
);

export const updateEventSchema = withScheduleRules(
  z
    .object({ ...eventFields, status: z.enum(EVENT_STATUSES) })
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'Provide at least one change'),
);

export const deleteEventQuery = z.object({ scope: z.enum(['one', 'following']).default('one') });
