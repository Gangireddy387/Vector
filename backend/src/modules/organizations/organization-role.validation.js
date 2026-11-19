import { z } from 'zod';
import { ORG_PERMISSION_KEYS } from './organization-role.constants.js';

const permissionList = z.array(z.enum(ORG_PERMISSION_KEYS)).min(1).max(ORG_PERMISSION_KEYS.length);

export const createOrganizationRoleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Key must start with a letter and use only lowercase letters, numbers and underscores')
    .optional(),
  description: z.string().trim().max(255).nullable().optional(),
  permissions: permissionList,
});

export const updateOrganizationRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    permissions: permissionList.optional(),
    position: z.number().int().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
