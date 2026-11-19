import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const GOAL_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
export const KEY_RESULT_METRIC_TYPES = ['percent', 'number', 'binary', 'linked_progress'];

/** Organization goal (objective) for an OKR period. */
export class Goal extends Model {}

Goal.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    ownerId: { type: DataTypes.UUID, allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
    periodStart: { type: DataTypes.DATEONLY, allowNull: true },
    periodEnd: { type: DataTypes.DATEONLY, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'Goal',
    tableName: 'goals',
    indexes: [
      { fields: ['organization_id', 'status'] },
      { fields: ['organization_id', 'period_start'] },
    ],
  },
);

/** Measurable key result under a goal. */
export class KeyResult extends Model {}

KeyResult.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    goalId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    metricType: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'percent' },
    startValue: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    targetValue: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 100 },
    currentValue: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(40), allowNull: true },
    ownerId: { type: DataTypes.UUID, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'KeyResult',
    tableName: 'key_results',
    indexes: [{ fields: ['goal_id', 'position'] }],
  },
);

/** Work linked to a key result for automatic progress (`linked_progress`). */
export class KeyResultLink extends Model {}

KeyResultLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    keyResultId: { type: DataTypes.UUID, allowNull: false },
    issueId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'KeyResultLink',
    tableName: 'key_result_links',
    indexes: [{ unique: true, fields: ['key_result_id', 'issue_id'] }],
  },
);
