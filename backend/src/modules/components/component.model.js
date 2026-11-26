import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class Component extends Model {}

Component.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#64748b' },
  },
  {
    sequelize,
    modelName: 'Component',
    tableName: 'components',
    indexes: [{ unique: true, fields: ['project_id', 'name'] }],
  },
);
