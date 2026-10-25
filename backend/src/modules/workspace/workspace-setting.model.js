import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const COLOR_MODES = ['light', 'dark', 'system'];

/** Single-row table (id = 1) holding portal-wide configuration. */
export class WorkspaceSetting extends Model {}

WorkspaceSetting.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    name: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Vector' },
    defaultMode: { type: DataTypes.ENUM(...COLOR_MODES), allowNull: false, defaultValue: 'system' },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'WorkspaceSetting', tableName: 'workspace_settings' },
);
