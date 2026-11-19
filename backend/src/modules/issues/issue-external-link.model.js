import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const EXTERNAL_LINK_PROVIDERS = ['github', 'gitlab', 'other'];

/** A GitHub / GitLab (or other) URL linked on a Vector issue. */
export class IssueExternalLink extends Model {}

IssueExternalLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'other' },
    url: { type: DataTypes.STRING(1000), allowNull: false },
    host: { type: DataTypes.STRING(255), allowNull: false },
    owner: { type: DataTypes.STRING(200), allowNull: true },
    repo: { type: DataTypes.STRING(200), allowNull: true },
    number: { type: DataTypes.INTEGER, allowNull: true },
    /** issue | pull | merge_request | null */
    kind: { type: DataTypes.STRING(20), allowNull: true },
    label: { type: DataTypes.STRING(255), allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'IssueExternalLink',
    tableName: 'issue_external_links',
    updatedAt: false,
    indexes: [
      { fields: ['issue_id'] },
      { unique: true, fields: ['issue_id', 'url'], name: 'issue_external_links_issue_url' },
    ],
  },
);
