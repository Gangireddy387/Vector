import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const DEFAULT_LABELS = [
  { name: 'frontend', color: '#0ea5e9' },
  { name: 'backend', color: '#f97316' },
  { name: 'design', color: '#ec4899' },
  { name: 'tech-debt', color: '#78716c' },
];

export class Label extends Model {}

Label.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(40), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#64748b' },
  },
  {
    sequelize,
    modelName: 'Label',
    tableName: 'labels',
    indexes: [{ unique: true, fields: ['project_id', 'name'] }],
  },
);
