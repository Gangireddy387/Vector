import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_STATUSES } from './calendar-event.model.js';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:mm format').nullable().optional();

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

export const listEventsQuery = z.object({ from: dateOnly, to: dateOnly });

export const createEventSchema = z.object({
  ...eventFields,
  repeat: z
    .object({ frequency: z.enum(['daily', 'weekdays', 'weekly']), until: dateOnly })
    .nullable()
    .optional(),
});

export const updateEventSchema = z
  .object({ ...eventFields, status: z.enum(EVENT_STATUSES) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change');

export const deleteEventQuery = z.object({ scope: z.enum(['one', 'following']).default('one') });
