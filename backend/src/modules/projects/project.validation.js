import { z } from 'zod';
import { AUTO_ASSIGN_STRATEGIES, PROJECT_TYPES } from './project.model.js';
import { PROJECT_ROLES } from './project-member.model.js';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a hex color such as #4f46e5');

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2-10 letters/numbers and start with a letter'),
  description: z.string().max(5000).nullable().optional(),
  type: z.enum(PROJECT_TYPES).default('scrum'),
  color: color.optional(),
  /** Create the project straight into a team (organization admins). */
  teamId: z.string().uuid().nullable().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(5000).nullable().optional(),
  type: z.enum(PROJECT_TYPES).optional(),
  color: color.optional(),
  leadId: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
  settings: z
    .object({
      autoAssign: z.enum(AUTO_ASSIGN_STRATEGIES).optional(),
      defaultAssigneeId: z.string().uuid().nullable().optional(),
      autoCloseParent: z.boolean().optional(),
      carryOverIncomplete: z.boolean().optional(),
      sprintLengthDays: z.number().int().min(1).max(60).optional(),
      dueReminderHours: z.number().int().min(1).max(168).optional(),
    })
    .optional(),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(PROJECT_ROLES).default('member'),
});

export const updateMemberSchema = z.object({ role: z.enum(PROJECT_ROLES) });

export const listProjectsQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
