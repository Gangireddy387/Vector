import { z } from 'zod';

const optionalString = z.string().trim().min(1).max(200).optional().nullable();
const SURFACES = ['issues', 'board'];

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
    customFieldId: optionalString,
    customFieldOp: optionalString,
    customFieldValue: optionalString,
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

/** Board view: filters + optional swimlane/density. */
export const boardCriteriaSchema = z
  .object({
    search: optionalString,
    /** Comma-separated user ids; may include `unassigned`. */
    assigneeIds: optionalString,
    types: optionalString,
    priorities: optionalString,
    labelIds: optionalString,
    /** Comma-separated: mine,dueSoon,overdue,recent */
    quick: optionalString,
    groupBy: z.enum(['none', 'assignee', 'priority', 'type', 'epic']).optional().nullable(),
    density: z.enum(['comfortable', 'compact']).optional().nullable(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry != null && entry !== ''), {
    message: 'Save at least one board setting',
  });

function criteriaForSurface(surface) {
  return surface === 'board' ? boardCriteriaSchema : filterCriteriaSchema;
}

export const listSavedFiltersQuery = z.object({
  projectId: z.string().uuid().optional(),
  surface: z.enum(SURFACES).optional().default('issues'),
});

export const createSavedFilterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    projectId: z.string().uuid().nullable().optional(),
    surface: z.enum(SURFACES).optional().default('issues'),
    criteria: z.record(z.string(), z.unknown()),
    isDefault: z.boolean().optional().default(false),
  })
  .transform((value, ctx) => {
    const surface = value.surface ?? 'issues';
    const parsed = criteriaForSurface(surface).safeParse(value.criteria);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: ['criteria', ...issue.path] });
      }
      return z.NEVER;
    }
    return { ...value, surface, criteria: parsed.data };
  });

export const updateSavedFilterSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    criteria: z.record(z.string(), z.unknown()).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one change');
