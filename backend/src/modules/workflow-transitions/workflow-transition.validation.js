import { z } from 'zod';

const uuid = z.string().uuid();

const ruleSchema = z.object({
  fromStatusId: uuid,
  toStatusIds: z.array(uuid).max(50).default([]),
  requireAssignee: z.boolean().default(false),
  requireComment: z.boolean().default(false),
});

export const replaceTransitionRulesSchema = z.object({
  rules: z.array(ruleSchema).max(50),
});
