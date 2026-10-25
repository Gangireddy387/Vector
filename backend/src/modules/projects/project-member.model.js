import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const PROJECT_ROLES = ['admin', 'member', 'viewer'];

export class ProjectMember extends Model {}

ProjectMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.ENUM(...PROJECT_ROLES), allowNull: false, defaultValue: 'member' },
  },
  {
    sequelize,
    modelName: 'ProjectMember',
    tableName: 'project_members',
    indexes: [{ unique: true, fields: ['project_id', 'user_id'] }],
  },
);
