import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from './issue.model.js';
import { ISSUE_LINK_TYPES } from './issue-relations.model.js';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');

const editableFields = {
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(50000).nullable(),
  type: z.enum(ISSUE_TYPES),
  priority: z.enum(ISSUE_PRIORITIES),
  statusId: uuid,
  assigneeId: uuid.nullable(),
  parentId: uuid.nullable(),
  sprintId: uuid.nullable(),
  storyPoints: z.number().int().min(0).max(100).nullable(),
  estimateMinutes: z.number().int().min(0).max(100000).nullable(),
  startDate: dateOnly.nullable(),
  dueDate: dateOnly.nullable(),
  labelIds: z.array(uuid).max(20),
  /** Versions this issue ships in (fix versions). */
  fixVersionIds: z.array(uuid).max(20),
  /** Versions where the issue was found (affected versions). */
  affectedVersionIds: z.array(uuid).max(20),
  /** Custom field values keyed by field id. */
  customFields: z.record(uuid, z.unknown()),
};

export const createIssueSchema = z
  .object(editableFields)
  .partial()
  .extend({
    projectId: uuid,
    title: editableFields.title,
    templateId: uuid.optional(),
    subtaskTitles: z.array(z.string().trim().min(1).max(255)).max(30).optional(),
  });

export const updateIssueSchema = z
  .object(editableFields)
  .partial()
  .extend({
    position: z.number().finite().optional(),
    /** Required by some workflow transitions when moving status. */
    transitionComment: z.string().trim().min(1).max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const moveIssueSchema = z.object({
  statusId: uuid.optional(),
  sprintId: uuid.nullable().optional(),
  position: z.number().finite(),
  transitionComment: z.string().trim().min(1).max(10000).optional(),
});

const bulkChanges = z
  .object({
    statusId: uuid,
    /** Cross-project: map each issue to its project's first status in this category. */
    statusCategory: z.enum(['todo', 'in_progress', 'done']),
    assigneeId: uuid.nullable(),
    priority: z.enum(ISSUE_PRIORITIES),
    type: z.enum(ISSUE_TYPES),
    sprintId: uuid.nullable(),
    dueDate: dateOnly.nullable(),
    addLabelIds: z.array(uuid).max(20),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one change')
  .refine((value) => !(value.statusId && value.statusCategory), 'Choose either a status or a status category, not both');

export const bulkUpdateSchema = z.object({ issueIds: z.array(uuid).min(1).max(200), changes: bulkChanges });
export const bulkDeleteSchema = z.object({ issueIds: z.array(uuid).min(1).max(200) });

export const listIssuesQuery = z.object({
  projectId: uuid.optional(),
  assigneeId: z.string().optional(),
  reporterId: z.string().optional(),
  statusId: z.string().optional(),
  statusCategory: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  labelId: z.string().optional(),
  fixVersionId: z.string().optional(),
  affectedVersionId: z.string().optional(),
  /** One custom-field constraint (AND with other filters). */
  customFieldId: z.string().uuid().optional(),
  customFieldOp: z
    .enum(['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt', 'in', 'not_in'])
    .optional(),
  customFieldValue: z.string().max(2000).optional(),
  sprintId: z.string().optional(),
  parentId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  overdue: z.enum(['true', 'false']).optional(),
  sort: z.enum(['position', 'createdAt', 'updatedAt', 'dueDate', 'priority', 'key']).default('position'),
  order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

export const watchIssueSchema = z.object({
  /** When set, add that teammate as a watcher (members only). Omit to watch yourself. */
  userId: uuid.optional(),
});

export const createLinkSchema = z.object({
  targetIssue: z.string().trim().min(1, 'Enter a task key'),
  type: z.enum(ISSUE_LINK_TYPES).default('relates_to'),
});

export const createExternalLinkSchema = z.object({
  url: z.string().trim().url('Enter a valid URL').max(1000),
});
