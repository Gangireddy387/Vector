import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const SHARE_SCOPES = ['board', 'issue'];

/**
 * Guest / public share links for a project board or a single issue.
 * Anyone with the token can read a redacted view; no account required.
 */
export class ShareLink extends Model {}

ShareLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    /** Set for issue shares; null for board shares. */
    issueId: { type: DataTypes.UUID, allowNull: true },
    scope: { type: DataTypes.ENUM(...SHARE_SCOPES), allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ShareLink',
    tableName: 'share_links',
    indexes: [
      { fields: ['token'], unique: true },
      { fields: ['project_id', 'scope'] },
      { fields: ['issue_id'] },
      { fields: ['organization_id'] },
    ],
  },
);
