import { z } from 'zod';
import { organizationName, organizationSlug } from '../auth/auth.validation.js';
import { COLOR_MODES } from '../workspace/workspace-setting.model.js';
import { ORGANIZATION_ROLES } from './organization.model.js';

export const createOrganizationSchema = z.object({ name: organizationName, slug: organizationSlug });

export const slugQuery = z.object({ slug: z.string().trim().max(80).default('') });

/** A named theme (`ocean`) or a hex colour (`#1a73e8`); null goes back to Vector's own colours. */
const brandColor = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(#[0-9a-f]{6}|[a-z]{3,16})$/, 'Pick a theme or a colour like #1a73e8')
  .nullable();

const ssoSchema = z.object({
  enabled: z.boolean().optional(),
  enforce: z.boolean().optional(),
  provider: z.enum(['google', 'microsoft', 'oidc']).optional(),
  allowedDomains: z.array(z.string().trim().max(80)).max(25).optional(),
  microsoftTenant: z.string().trim().max(64).nullable().optional(),
  oidc: z
    .object({
      issuer: z.string().trim().max(300).nullable().optional(),
      clientId: z.string().trim().max(200).nullable().optional(),
      /** Plain secret from the admin UI; empty string keeps the previously stored secret. */
      clientSecret: z.string().max(500).nullable().optional(),
      scopes: z.string().trim().max(200).nullable().optional(),
    })
    .optional(),
});

const channelNotificationsSchema = z.object({
  enabled: z.boolean().optional(),
  events: z
    .object({
      assigned: z.boolean().optional(),
      commented: z.boolean().optional(),
      due_soon: z.boolean().optional(),
      sprint_started: z.boolean().optional(),
    })
    .optional(),
  /** Empty string keeps the stored URL; null clears it. */
  slackWebhookUrl: z.string().max(2000).nullable().optional(),
  teamsWebhookUrl: z.string().max(2000).nullable().optional(),
});

/** Days to keep data; `0` = forever. Cap matches the purge job. */
const retentionDays = z.coerce.number().int().min(0).max(3650);
const retentionSchema = z.object({
  auditLogDays: retentionDays.optional(),
  activityDays: retentionDays.optional(),
  notificationDays: retentionDays.optional(),
  transcriptDays: retentionDays.optional(),
  recordingDays: retentionDays.optional(),
});

export const updateOrganizationSchema = z
  .object({
    name: organizationName,
    slug: organizationSlug,
    defaultMode: z.enum(COLOR_MODES),
    brandColor,
    requireMfa: z.boolean(),
    sso: ssoSchema,
    channelNotifications: channelNotificationsSchema,
    retention: retentionSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one setting');

export const updateMemberSchema = z
  .object({
    workspaceRole: z.enum(ORGANIZATION_ROLES),
    status: z.enum(['active', 'disabled']),
    /** Custom role id (null clears). Only applies when workspaceRole is member. */
    customRoleId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a role or status');

export const deleteOrganizationSchema = z.object({ confirmName: z.string().min(1, 'Type the organization name to confirm') });

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(ORGANIZATION_ROLES).default('member'),
  customRoleId: z.string().uuid().nullable().optional(),
});
