import { z } from 'zod';
import { STATUS_CATEGORIES } from './status.model.js';

const statusFields = {
  name: z.string().trim().min(1).max(60),
  category: z.enum(STATUS_CATEGORIES),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  wipLimit: z.number().int().min(1).max(999).nullable(),
};

export const createStatusSchema = z.object({
  name: statusFields.name,
  category: statusFields.category.default('in_progress'),
  color: statusFields.color.optional(),
  wipLimit: statusFields.wipLimit.optional(),
});

export const updateStatusSchema = z.object(statusFields).partial();

export const reorderStatusesSchema = z.object({ statusIds: z.array(z.string().uuid()).min(1) });

export const deleteStatusQuery = z.object({ moveIssuesTo: z.string().uuid().optional() });
