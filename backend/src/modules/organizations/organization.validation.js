import { z } from 'zod';
import { organizationName, organizationSlug } from '../auth/auth.validation.js';
import { COLOR_MODES } from '../workspace/workspace-setting.model.js';
import { ORGANIZATION_ROLES } from './organization.model.js';

export const createOrganizationSchema = z.object({ name: organizationName, slug: organizationSlug });

export const slugQuery = z.object({ slug: z.string().trim().max(80).default('') });

export const updateOrganizationSchema = z
  .object({ name: organizationName, slug: organizationSlug, defaultMode: z.enum(COLOR_MODES) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one setting');

export const updateMemberSchema = z
  .object({ workspaceRole: z.enum(ORGANIZATION_ROLES), status: z.enum(['active', 'disabled']) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a role or status');

export const deleteOrganizationSchema = z.object({ confirmName: z.string().min(1, 'Type the organization name to confirm') });

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(ORGANIZATION_ROLES).default('member'),
});
