import { z } from 'zod';
import { GOAL_STATUSES, KEY_RESULT_METRIC_TYPES } from './goal.model.js';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

export const goalIdParams = z.object({ goalId: uuid });
export const keyResultParams = z.object({ goalId: uuid, keyResultId: uuid });
export const linkParams = z.object({ goalId: uuid, keyResultId: uuid, linkId: uuid });

export const listGoalsQuery = z.object({
  status: z.enum(GOAL_STATUSES).optional(),
  projectId: uuid.optional(),
});

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  projectId: uuid.nullable().optional(),
  parentGoalId: uuid.nullable().optional(),
  ownerId: uuid.nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  periodStart: dateOnly,
  periodEnd: dateOnly,
});

export const updateGoalSchema = createGoalSchema.partial();

export const createCheckInSchema = z.object({
  value: z.number().finite(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const listCheckInsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createKeyResultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  metricType: z.enum(KEY_RESULT_METRIC_TYPES).optional(),
  startValue: z.number().finite().optional(),
  targetValue: z.number().finite().optional(),
  currentValue: z.number().finite().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  ownerId: uuid.nullable().optional(),
});

export const updateKeyResultSchema = createKeyResultSchema.partial();

export const createLinkSchema = z.object({
  issueId: uuid,
});
