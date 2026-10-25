import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const STATUS_CATEGORIES = ['todo', 'in_progress', 'done'];

export const DEFAULT_STATUSES = [
  { name: 'To Do', category: 'todo', color: '#64748b' },
  { name: 'In Progress', category: 'in_progress', color: '#3b82f6' },
  { name: 'In Review', category: 'in_progress', color: '#a855f7' },
  { name: 'Done', category: 'done', color: '#22c55e' },
];

export class Status extends Model {}

Status.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    category: { type: DataTypes.ENUM(...STATUS_CATEGORIES), allowNull: false, defaultValue: 'todo' },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#64748b' },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    wipLimit: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'Status', tableName: 'statuses', indexes: [{ fields: ['project_id'] }] },
);
