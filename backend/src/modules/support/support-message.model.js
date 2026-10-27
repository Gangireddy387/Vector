import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/**
 * One message in the conversation between the portal's super admin and an organization's admins
 * (one conversation per organization). `readAt` is when the other side first saw it.
 */
export class SupportMessage extends Model {}

SupportMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    /** Written by the super admin (true) or by one of the organization's admins (false). */
    fromPortal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /** `message` from a person, or a `system` notice such as "turned on disappearing messages". */
    kind: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'message' },
    body: { type: DataTypes.TEXT, allowNull: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
    /** Deleted for everyone by its author; the body is cleared and the bubble says so. */
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    /** Disappearing messages are removed after this moment. */
    expiresAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'SupportMessage',
    tableName: 'support_messages',
    indexes: [{ fields: ['organization_id', 'created_at'] }, { fields: ['expires_at'] }],
  },
);
