import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const VERSION_STATUSES = ['unreleased', 'released', 'archived'];

export class Version extends Model {}

Version.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM(...VERSION_STATUSES), allowNull: false, defaultValue: 'unreleased' },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    releaseDate: { type: DataTypes.DATEONLY, allowNull: true },
    releasedAt: { type: DataTypes.DATE, allowNull: true },
    /** Markdown release notes (editable; regeneratable from fix-version issues). */
    releaseNotes: { type: DataTypes.TEXT, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'Version',
    tableName: 'project_versions',
    indexes: [
      { unique: true, fields: ['project_id', 'name'] },
      { fields: ['project_id', 'status'] },
    ],
  },
);

export class IssueFixVersion extends Model {}
IssueFixVersion.init(
  {
    issueId: { type: DataTypes.UUID, primaryKey: true },
    versionId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, modelName: 'IssueFixVersion', tableName: 'issue_fix_versions', timestamps: false },
);

export class IssueAffectedVersion extends Model {}
IssueAffectedVersion.init(
  {
    issueId: { type: DataTypes.UUID, primaryKey: true },
    versionId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, modelName: 'IssueAffectedVersion', tableName: 'issue_affected_versions', timestamps: false },
);
