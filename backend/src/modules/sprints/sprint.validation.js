import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');

export const createSprintSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  startDate: dateOnly.nullable().optional(),
  endDate: dateOnly.nullable().optional(),
});

export const updateSprintSchema = createSprintSchema;

export const startSprintSchema = z.object({
  goal: z.string().trim().max(2000).nullable().optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
});

export const completeSprintSchema = z.object({
  moveIncompleteTo: z.union([z.enum(['backlog', 'new_sprint', 'next_sprint']), z.string().uuid()]).optional(),
});
