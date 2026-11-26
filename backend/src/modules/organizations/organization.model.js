import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { COLOR_MODES } from '../workspace/workspace-setting.model.js';

export const ORGANIZATION_ROLES = ['admin', 'member'];
export const ORGANIZATION_MEMBER_STATUSES = ['active', 'disabled'];
/** New organizations wait for the super admin; only approved ones can use the portal. */
export const ORGANIZATION_STATUSES = ['pending', 'approved', 'rejected'];

/** A company or team using Vector. Everything (people, projects, settings) belongs to exactly one organization. */
export class Organization extends Model {}

Organization.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** The organization's address, e.g. `acme` in example.com/acme. */
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    defaultMode: { type: DataTypes.ENUM(...COLOR_MODES), allowNull: false, defaultValue: 'system' },
    logoUrl: { type: DataTypes.STRING(255), allowNull: true },
    /** Theme colour everyone in the organization sees: a named theme (e.g. `ocean`) or a hex colour such as `#1a73e8` (null = Vector's own). */
    brandColor: { type: DataTypes.STRING(20), allowNull: true },
    /** How strong the brand tint is on the sidebar and canvas (0 = subtle, 100 = bold). Null uses the soft default. */
    brandBrightness: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', validate: { isIn: [ORGANIZATION_STATUSES] } },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedById: { type: DataTypes.UUID, allowNull: true },
    /** Shown to the organization's people when the super admin rejects it. */
    rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
    /** The plan the super admin assigned; decides which features and how many people and projects it may use. */
    planId: { type: DataTypes.UUID, allowNull: true },
    /** Features the super admin turned on or off for this organization only, e.g. `{ reports: true }`; they win over the plan. */
    featureOverrides: { type: DataTypes.JSON, allowNull: true },
    /**
     * Pending plan request from an org admin: `{ target, note, requestedById, requestedByName, createdAt, status }`.
     * Cleared when the portal admin changes the plan.
     */
    upgradeRequest: { type: DataTypes.JSON, allowNull: true },
    /** Support chat with the super admin: new messages disappear after this many hours (null = kept). */
    supportDisappearHours: { type: DataTypes.INTEGER, allowNull: true },
    /** Support chat: when each person cleared it for themselves, `{ [userId]: ISO date }`; they only see newer messages. */
    supportClearedAt: { type: DataTypes.JSON, allowNull: true },
    /** When true, members must enable two-factor authentication to use this organization. */
    requireMfa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /**
     * Enterprise SSO (needs plan feature `sso`):
     * `{ enabled, enforce, provider: 'google'|'microsoft'|'oidc', allowedDomains, microsoftTenant?, oidc?: { issuer, clientId, clientSecret, scopes } }`
     */
    sso: { type: DataTypes.JSON, allowNull: true },
    /**
     * Slack / Teams Incoming Webhooks (plan feature `channelNotifications`):
     * `{ enabled, events, slackWebhookUrl?, teamsWebhookUrl? }`
     */
    channelNotifications: { type: DataTypes.JSON, allowNull: true },
    /**
     * GitHub inbound webhook sync (plan feature `vcsLinks`):
     * `{ enabled, secretEncrypted, secretPrefix, lastDeliveryAt?, lastEvent?, lastError? }`
     */
    githubWebhook: { type: DataTypes.JSON, allowNull: true },
    /**
     * GitLab inbound webhook sync (plan feature `vcsLinks`):
     * `{ enabled, mergeClosesIssue?, secretEncrypted, secretPrefix, lastDeliveryAt?, lastEvent?, lastError? }`
     */
    gitlabWebhook: { type: DataTypes.JSON, allowNull: true },
    /**
     * Data retention (days; `0` = keep forever):
     * `{ auditLogDays, activityDays, notificationDays, transcriptDays, recordingDays }`
     */
    retention: { type: DataTypes.JSON, allowNull: true },
    /**
     * Who may be invited into the organization:
     * `{ restrictDomains, allowedDomains: string[] }` — when restrictDomains is true, only listed domains.
     */
    invitePolicy: { type: DataTypes.JSON, allowNull: true },
    /** Capacity planning defaults: `{ minutesPerWeek }` (default 40h). */
    capacity: { type: DataTypes.JSON, allowNull: true },
    /**
     * AI org grounding (plan feature `aiAssistant`):
     * `{ instructions: string }` — house style / product facts injected into writing assist, chat, wiki AI.
     */
    aiGrounding: { type: DataTypes.JSON, allowNull: true },
    /** Stripe customer / subscription ids when the organization pays for Pro via Checkout. */
    stripeCustomerId: { type: DataTypes.STRING(80), allowNull: true },
    stripeSubscriptionId: { type: DataTypes.STRING(80), allowNull: true },
    /** Paid seat count from Stripe (subscription quantity). When set, overrides the plan’s people limit. */
    billedSeats: { type: DataTypes.INTEGER, allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'Organization', tableName: 'organizations' },
);

/** A person's membership in an organization. Admins manage the organization's settings and people. */
export class OrganizationMember extends Model {}

OrganizationMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.ENUM(...ORGANIZATION_ROLES), allowNull: false, defaultValue: 'member' },
    /** Optional custom role (plan feature `customRoles`); ignored when role is admin. */
    customRoleId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM(...ORGANIZATION_MEMBER_STATUSES), allowNull: false, defaultValue: 'active' },
  },
  {
    sequelize,
    modelName: 'OrganizationMember',
    tableName: 'organization_members',
    indexes: [
      { unique: true, fields: ['organization_id', 'user_id'] },
      { fields: ['user_id'] },
      { fields: ['custom_role_id'] },
    ],
  },
);
