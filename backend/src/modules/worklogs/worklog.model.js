import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class WorkLog extends Model {}

WorkLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    minutes: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    note: { type: DataTypes.STRING(500), allowNull: true },
    loggedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'WorkLog', tableName: 'work_logs', indexes: [{ fields: ['issue_id'] }] },
);
