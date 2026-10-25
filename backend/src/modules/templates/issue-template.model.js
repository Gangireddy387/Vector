import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';

export class IssueTemplate extends Model {}

IssueTemplate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    issueType: { type: DataTypes.ENUM(...ISSUE_TYPES), allowNull: false, defaultValue: 'task' },
    titlePrefix: { type: DataTypes.STRING(120), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    priority: { type: DataTypes.ENUM(...ISSUE_PRIORITIES), allowNull: false, defaultValue: 'medium' },
    storyPoints: { type: DataTypes.INTEGER, allowNull: true },
    labelIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    subtaskTitles: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'IssueTemplate', tableName: 'issue_templates', indexes: [{ fields: ['project_id'] }] },
);
