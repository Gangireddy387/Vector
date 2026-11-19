import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** A named set of org permissions; assigned to members via `OrganizationMember.customRoleId`. */
export class OrganizationRole extends Model {}

OrganizationRole.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    /** Stable slug unique per organization. */
    key: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'OrganizationRole',
    tableName: 'organization_roles',
    indexes: [
      { unique: true, fields: ['organization_id', 'key'] },
      { unique: true, fields: ['organization_id', 'name'] },
      { fields: ['organization_id', 'position'] },
    ],
  },
);
