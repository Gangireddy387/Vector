import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const PROJECT_TYPES = ['scrum', 'kanban'];
export const AUTO_ASSIGN_STRATEGIES = ['none', 'round_robin', 'least_loaded', 'project_lead', 'default_assignee'];

export const DEFAULT_PROJECT_SETTINGS = Object.freeze({
  autoAssign: 'none',
  defaultAssigneeId: null,
  autoCloseParent: true,
  carryOverIncomplete: true,
  sprintLengthDays: 14,
  dueReminderHours: 24,
  lastRoundRobinUserId: null,
  /** Weekday standup ritual (hours are each member’s local clock). */
  standupEnabled: true,
  standupReminderHour: 9,
  standupDigestHour: 11,
  /**
   * Comment-only: non-admins may view and comment but not edit work. New invites default to viewer;
   * the Member role cannot be assigned while this is on (Admin and Viewer only).
   */
  commentOnly: false,
  /**
   * Per-field edit ACL. Missing key or empty actors = any project editor (member+).
   * Non-empty = only listed actors (same as workflow: admin, scrum_master, team_lead, member, viewer).
   * Status stays under workflow transition rules.
   */
  fieldPermissions: {},
  /** Optional AI instructions for this project (overrides / adds to org grounding). */
  aiInstructions: '',
});

export class Project extends Model {}

Project.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: true },
    /** Unique within the organization, so two companies can both have a "WEB" project. */
    key: { type: DataTypes.STRING(10), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    type: { type: DataTypes.ENUM(...PROJECT_TYPES), allowNull: false, defaultValue: 'scrum' },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#6366f1' },
    leadId: { type: DataTypes.UUID, allowNull: true },
    /** The team that owns this project (and through it, the team's department). */
    teamId: { type: DataTypes.UUID, allowNull: true },
    issueCounter: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    settings: { type: DataTypes.JSON, allowNull: false, defaultValue: DEFAULT_PROJECT_SETTINGS },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Project',
    tableName: 'projects',
    indexes: [{ unique: true, fields: ['organization_id', 'key'], name: 'projects_organization_key' }],
  },
);
