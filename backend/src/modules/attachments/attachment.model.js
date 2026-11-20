import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export class Attachment extends Model {
  toJSON() {
    const { storageKey: _storageKey, thumbStorageKey: _thumbStorageKey, ...values } = this.get();
    return {
      ...values,
      hasThumb: Boolean(_thumbStorageKey),
    };
  }
}

Attachment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    /** When set, this file belongs to a comment (excluded from the issue Attachments tab). */
    commentId: { type: DataTypes.UUID, allowNull: true },
    uploaderId: { type: DataTypes.UUID, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(255), allowNull: false },
    /** Optional ~320px WebP sibling for image thumbs. */
    thumbStorageKey: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Attachment',
    tableName: 'attachments',
    indexes: [{ fields: ['issue_id'] }, { fields: ['comment_id'] }],
  },
);
