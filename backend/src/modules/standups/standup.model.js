import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** One person's daily standup in a project: what they did, what they will do, and what is in the way. */
export class StandupUpdate extends Model {}

StandupUpdate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    yesterday: { type: DataTypes.TEXT, allowNull: true },
    today: { type: DataTypes.TEXT, allowNull: true },
    blockers: { type: DataTypes.TEXT, allowNull: true },
    /** Tasks referenced in the update (by key), recorded as follow-ups on those tasks. */
    issueIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  },
  {
    sequelize,
    modelName: 'StandupUpdate',
    tableName: 'standup_updates',
    indexes: [{ unique: true, fields: ['project_id', 'user_id', 'date'] }, { fields: ['project_id', 'date'] }],
  },
);
