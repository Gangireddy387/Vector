import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class SavedFilter extends Model {}

SavedFilter.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    /** Same shape as the issue list query string (assigneeId, type, priority, ...). */
    criteria: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    /** Opened automatically when that person lands on Tasks (scoped per project or global). */
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'SavedFilter',
    tableName: 'saved_filters',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'project_id', 'is_default'] },
    ],
  },
);
