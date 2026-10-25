import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';

const templateFields = {
  name: z.string().trim().min(2).max(120),
  issueType: z.enum(ISSUE_TYPES),
  titlePrefix: z.string().trim().max(120).nullable(),
  body: z.string().max(50000).nullable(),
  priority: z.enum(ISSUE_PRIORITIES),
  storyPoints: z.number().int().min(0).max(100).nullable(),
  labelIds: z.array(z.string().uuid()).max(20),
  subtaskTitles: z.array(z.string().trim().min(1).max(255)).max(30),
};

export const createTemplateSchema = z.object({
  ...templateFields,
  issueType: templateFields.issueType.default('task'),
  titlePrefix: templateFields.titlePrefix.optional(),
  body: templateFields.body.optional(),
  priority: templateFields.priority.default('medium'),
  storyPoints: templateFields.storyPoints.optional(),
  labelIds: templateFields.labelIds.default([]),
  subtaskTitles: templateFields.subtaskTitles.default([]),
});

export const updateTemplateSchema = z.object(templateFields).partial();
