import { z } from 'zod';

const optionalString = z.string().trim().min(1).max(200).optional().nullable();

/** Same keys the issue list / URL filters accept — rejects arbitrary junk. */
export const filterCriteriaSchema = z
  .object({
    q: optionalString,
    assigneeId: optionalString,
    reporterId: optionalString,
    statusId: optionalString,
    statusCategory: optionalString,
    type: optionalString,
    priority: optionalString,
    labelId: optionalString,
    sprintId: optionalString,
    parentId: optionalString,
    dueFrom: optionalString,
    dueTo: optionalString,
    overdue: z.enum(['true', 'false']).optional().nullable(),
    sort: z.enum(['position', 'createdAt', 'updatedAt', 'dueDate', 'priority', 'key']).optional().nullable(),
    order: z.enum(['asc', 'desc']).optional().nullable(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry != null && entry !== ''), {
    message: 'Save at least one filter',
  });

export const listSavedFiltersQuery = z.object({
  projectId: z.string().uuid().optional(),
});

export const createSavedFilterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  projectId: z.string().uuid().nullable().optional(),
  criteria: filterCriteriaSchema,
  isDefault: z.boolean().optional().default(false),
});

export const updateSavedFilterSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    criteria: filterCriteriaSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one change');
