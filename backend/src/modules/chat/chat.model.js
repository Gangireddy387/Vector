import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const CHAT_MESSAGE_KINDS = ['user', 'bot'];

/** A message in a project's team chat. Bot messages have no author and carry structured data in `meta`. */
export class ChatMessage extends Model {}

ChatMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.ENUM(...CHAT_MESSAGE_KINDS), allowNull: false, defaultValue: 'user' },
    body: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.JSON, allowNull: true },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ChatMessage',
    tableName: 'chat_messages',
    indexes: [{ fields: ['project_id', 'created_at'] }],
  },
);

/** Tasks a chat message refers to, so every task keeps a record of the conversation about it. */
export class ChatMessageIssue extends Model {}

ChatMessageIssue.init(
  {
    messageId: { type: DataTypes.UUID, primaryKey: true },
    issueId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, modelName: 'ChatMessageIssue', tableName: 'chat_message_issues', timestamps: false, indexes: [{ fields: ['issue_id'] }] },
);
