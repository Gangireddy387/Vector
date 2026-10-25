import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class AutomationRule extends Model {}

AutomationRule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    trigger: { type: DataTypes.STRING(40), allowNull: false },
    /** [{ field, operator, value }] — all must match. */
    conditions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    /** [{ type, params }] — executed in order. */
    actions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    runCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastRunAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'AutomationRule', tableName: 'automation_rules', indexes: [{ fields: ['project_id'] }] },
);
