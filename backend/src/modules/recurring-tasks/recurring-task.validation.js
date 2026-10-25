import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { RECURRING_FREQUENCIES } from './recurring-task.model.js';

const recurringFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().max(50000).nullable(),
  issueType: z.enum(ISSUE_TYPES.filter((type) => type !== 'subtask')),
  priority: z.enum(ISSUE_PRIORITIES),
  assigneeId: z.string().uuid().nullable(),
  labelIds: z.array(z.string().uuid()).max(20),
  frequency: z.enum(RECURRING_FREQUENCIES),
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  dayOfMonth: z.number().int().min(1).max(28).nullable(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:mm format'),
  dueInDays: z.number().int().min(0).max(90).nullable(),
  enabled: z.boolean(),
};

export const createRecurringTaskSchema = z.object({
  ...recurringFields,
  description: recurringFields.description.optional(),
  issueType: recurringFields.issueType.default('task'),
  priority: recurringFields.priority.default('medium'),
  assigneeId: recurringFields.assigneeId.optional(),
  labelIds: recurringFields.labelIds.default([]),
  frequency: recurringFields.frequency.default('weekly'),
  dayOfWeek: recurringFields.dayOfWeek.optional(),
  dayOfMonth: recurringFields.dayOfMonth.optional(),
  timeOfDay: recurringFields.timeOfDay.default('09:00'),
  dueInDays: recurringFields.dueInDays.optional(),
  enabled: recurringFields.enabled.default(true),
});

export const updateRecurringTaskSchema = z.object(recurringFields).partial();
