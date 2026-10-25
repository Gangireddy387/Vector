import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const SPRINT_STATES = ['planned', 'active', 'completed'];

export class Sprint extends Model {}

Sprint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    goal: { type: DataTypes.TEXT, allowNull: true },
    state: { type: DataTypes.ENUM(...SPRINT_STATES), allowNull: false, defaultValue: 'planned' },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    /** Snapshot taken on completion: committed/completed points and counts for velocity reports. */
    summary: { type: DataTypes.JSON, allowNull: true },
  },
  { sequelize, modelName: 'Sprint', tableName: 'sprints', indexes: [{ fields: ['project_id'] }] },
);
