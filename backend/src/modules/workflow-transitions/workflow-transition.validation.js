import { z } from 'zod';
import { PROJECT_TRANSITION_ACTORS } from './workflow-transition.service.js';

const uuid = z.string().uuid();

const ruleSchema = z.object({
  fromStatusId: uuid,
  toStatusIds: z.array(uuid).max(50).default([]),
  requireAssignee: z.boolean().default(false),
  requireComment: z.boolean().default(false),
  allowedRoles: z.array(z.enum(PROJECT_TRANSITION_ACTORS)).max(PROJECT_TRANSITION_ACTORS.length).default([]),
});

export const replaceTransitionRulesSchema = z.object({
  rules: z.array(ruleSchema).max(50),
});
