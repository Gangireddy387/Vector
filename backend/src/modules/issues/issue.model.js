import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'];
export const ISSUE_PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'];
export const PRIORITY_RANK = { lowest: 1, low: 2, medium: 3, high: 4, highest: 5 };

export class Issue extends Model {}

Issue.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    number: { type: DataTypes.INTEGER, allowNull: false },
    /** Unique within an organization (project keys are per organization). */
    key: { type: DataTypes.STRING(24), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    type: { type: DataTypes.ENUM(...ISSUE_TYPES), allowNull: false, defaultValue: 'task' },
    priority: { type: DataTypes.ENUM(...ISSUE_PRIORITIES), allowNull: false, defaultValue: 'medium' },
    statusId: { type: DataTypes.UUID, allowNull: false },
    assigneeId: { type: DataTypes.UUID, allowNull: true },
    reporterId: { type: DataTypes.UUID, allowNull: true },
    parentId: { type: DataTypes.UUID, allowNull: true },
    sprintId: { type: DataTypes.UUID, allowNull: true },
    storyPoints: { type: DataTypes.INTEGER, allowNull: true },
    estimateMinutes: { type: DataTypes.INTEGER, allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    /** Global rank shared by board columns and backlog lists (fractional indexing). */
    position: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    dueReminderSentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Issue',
    tableName: 'issues',
    indexes: [
      { fields: ['project_id'] },
      { fields: ['key'] },
      { fields: ['status_id'] },
      { fields: ['assignee_id'] },
      { fields: ['sprint_id'] },
      { fields: ['parent_id'] },
    ],
  },
);
