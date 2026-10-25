import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class Attachment extends Model {
  toJSON() {
    const { storageKey, ...values } = this.get();
    return values;
  }
}

Attachment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    uploaderId: { type: DataTypes.UUID, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(255), allowNull: false },
  },
  { sequelize, modelName: 'Attachment', tableName: 'attachments', indexes: [{ fields: ['issue_id'] }] },
);
