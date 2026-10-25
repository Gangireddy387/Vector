import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class Comment extends Model {}

Comment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'Comment', tableName: 'comments', indexes: [{ fields: ['issue_id'] }] },
);
