import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class Activity extends Model {}

Activity.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    issueId: { type: DataTypes.UUID, allowNull: true },
    actorId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    field: { type: DataTypes.STRING(40), allowNull: true },
    fromValue: { type: DataTypes.TEXT, allowNull: true },
    toValue: { type: DataTypes.TEXT, allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Activity',
    tableName: 'activities',
    updatedAt: false,
    indexes: [{ fields: ['project_id'] }, { fields: ['issue_id'] }],
  },
);
