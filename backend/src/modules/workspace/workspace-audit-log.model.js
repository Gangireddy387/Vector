import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class WorkspaceAuditLog extends Model {}

WorkspaceAuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    actorId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(60), allowNull: false },
    targetType: { type: DataTypes.STRING(40), allowNull: true },
    targetId: { type: DataTypes.STRING(64), allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'WorkspaceAuditLog',
    tableName: 'workspace_audit_logs',
    updatedAt: false,
    indexes: [{ fields: ['organization_id', 'created_at'] }, { fields: ['organization_id', 'id'] }],
  },
);
