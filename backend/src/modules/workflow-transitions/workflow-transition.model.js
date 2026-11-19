import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/**
 * Allowed moves out of a status. If a from-status has no row, any target is allowed (legacy behaviour).
 * When a row exists, `toStatusIds` is the whitelist (always may stay on the same status).
 */
export class WorkflowTransitionRule extends Model {}

WorkflowTransitionRule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    fromStatusId: { type: DataTypes.UUID, allowNull: false },
    /** Status ids this column may move to (excluding self, which is always allowed). */
    toStatusIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    requireAssignee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requireComment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'WorkflowTransitionRule',
    tableName: 'workflow_transition_rules',
    indexes: [{ unique: true, fields: ['project_id', 'from_status_id'] }],
  },
);
