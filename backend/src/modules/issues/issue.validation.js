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
  .extend({ position: z.number().finite().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const moveIssueSchema = z.object({
  statusId: uuid.optional(),
  sprintId: uuid.nullable().optional(),
  position: z.number().finite(),
});

const bulkChanges = z
  .object({
    statusId: uuid,
    assigneeId: uuid.nullable(),
    priority: z.enum(ISSUE_PRIORITIES),
    type: z.enum(ISSUE_TYPES),
    sprintId: uuid.nullable(),
    dueDate: dateOnly.nullable(),
    addLabelIds: z.array(uuid).max(20),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one change');

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

export const createLinkSchema = z.object({
  targetIssue: z.string().trim().min(1, 'Enter a task key'),
  type: z.enum(ISSUE_LINK_TYPES).default('relates_to'),
});
