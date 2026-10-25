import { z } from 'zod';
import { ISSUE_PRIORITIES } from '../issues/issue.model.js';
import {
  ASSIGN_STRATEGIES,
  AUTOMATION_TRIGGERS,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  RECIPIENT_GROUPS,
} from './automation.constants.js';

const uuid = z.string().uuid();
const recipients = {
  recipients: z.array(z.enum(RECIPIENT_GROUPS)).default([]),
  userIds: z.array(uuid).default([]),
};

const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]).optional(),
});

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_status'), params: z.object({ statusId: uuid }) }),
  z.object({ type: z.literal('set_priority'), params: z.object({ priority: z.enum(ISSUE_PRIORITIES) }) }),
  z.object({
    type: z.literal('assign'),
    params: z
      .object({ strategy: z.enum(ASSIGN_STRATEGIES), userId: uuid.optional() })
      .refine((params) => params.strategy !== 'user' || params.userId, 'Choose who to assign'),
  }),
  z.object({ type: z.literal('add_labels'), params: z.object({ labelIds: z.array(uuid).min(1) }) }),
  z.object({ type: z.literal('remove_labels'), params: z.object({ labelIds: z.array(uuid).min(1) }) }),
  z.object({ type: z.literal('add_comment'), params: z.object({ body: z.string().trim().min(1).max(5000) }) }),
  z.object({ type: z.literal('notify'), params: z.object({ ...recipients, message: z.string().trim().min(1).max(500) }) }),
  z.object({
    type: z.literal('send_email'),
    params: z.object({ ...recipients, subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(5000) }),
  }),
  z.object({ type: z.literal('set_due_date'), params: z.object({ daysFromNow: z.number().int().min(0).max(365) }) }),
  z.object({ type: z.literal('set_story_points'), params: z.object({ storyPoints: z.number().int().min(0).max(100) }) }),
  z.object({ type: z.literal('move_to_active_sprint'), params: z.object({}).default({}) }),
  z.object({
    type: z.literal('create_subtasks'),
    params: z.object({ titles: z.array(z.string().trim().min(1).max(255)).min(1).max(20) }),
  }),
]);

const ruleFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable(),
  enabled: z.boolean(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.array(conditionSchema).max(10),
  actions: z.array(actionSchema).min(1, 'Add at least one action').max(10),
};

export const createRuleSchema = z.object({
  ...ruleFields,
  description: ruleFields.description.optional(),
  enabled: ruleFields.enabled.default(true),
  conditions: ruleFields.conditions.default([]),
});

export const updateRuleSchema = z.object(ruleFields).partial();
