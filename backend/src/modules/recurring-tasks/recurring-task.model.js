import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';

export const RECURRING_FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly'];

export class RecurringTask extends Model {}

RecurringTask.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    issueType: { type: DataTypes.ENUM(...ISSUE_TYPES), allowNull: false, defaultValue: 'task' },
    priority: { type: DataTypes.ENUM(...ISSUE_PRIORITIES), allowNull: false, defaultValue: 'medium' },
    assigneeId: { type: DataTypes.UUID, allowNull: true },
    labelIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    frequency: { type: DataTypes.ENUM(...RECURRING_FREQUENCIES), allowNull: false, defaultValue: 'weekly' },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 6 } },
    dayOfMonth: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 28 } },
    timeOfDay: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '09:00' },
    dueInDays: { type: DataTypes.INTEGER, allowNull: true },
    nextRunAt: { type: DataTypes.DATE, allowNull: false },
    lastRunAt: { type: DataTypes.DATE, allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'RecurringTask', tableName: 'recurring_tasks', indexes: [{ fields: ['next_run_at'] }] },
);
