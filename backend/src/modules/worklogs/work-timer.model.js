import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** One running timer per user (org-scoped). Stop creates a WorkLog. */
export class WorkTimer extends Model {}

WorkTimer.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    issueId: { type: DataTypes.UUID, allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    note: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: 'WorkTimer',
    tableName: 'work_timers',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['issue_id'] },
    ],
  },
);
