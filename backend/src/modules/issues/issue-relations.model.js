import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const ISSUE_LINK_TYPES = ['blocks', 'relates_to', 'duplicates'];

export class IssueLabel extends Model {}
IssueLabel.init(
  {
    issueId: { type: DataTypes.UUID, primaryKey: true },
    labelId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, modelName: 'IssueLabel', tableName: 'issue_labels', timestamps: false },
);

export class IssueWatcher extends Model {}
IssueWatcher.init(
  {
    issueId: { type: DataTypes.UUID, primaryKey: true },
    userId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, modelName: 'IssueWatcher', tableName: 'issue_watchers', updatedAt: false },
);

export class IssueLink extends Model {}
IssueLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sourceIssueId: { type: DataTypes.UUID, allowNull: false },
    targetIssueId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...ISSUE_LINK_TYPES), allowNull: false, defaultValue: 'relates_to' },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'IssueLink',
    tableName: 'issue_links',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['source_issue_id', 'target_issue_id', 'type'] }],
  },
);
