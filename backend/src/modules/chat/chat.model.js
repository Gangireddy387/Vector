import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

import { REACTION_EMOJIS } from '../messages/reaction-emojis.js';

export const CHAT_MESSAGE_KINDS = ['user', 'bot'];
export const CHAT_REACTION_EMOJIS = REACTION_EMOJIS;

/** A message in a project's team chat. Bot messages have no author and carry structured data in `meta`. */
export class ChatMessage extends Model {}

ChatMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    /** Reply to a top-level user message (one level, like Teams). */
    parentId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.ENUM(...CHAT_MESSAGE_KINDS), allowNull: false, defaultValue: 'user' },
    body: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.JSON, allowNull: true },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ChatMessage',
    tableName: 'chat_messages',
    indexes: [{ fields: ['project_id', 'created_at'] }, { fields: ['parent_id'] }],
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

/** One person's reaction to a project chat message. */
export class ChatReaction extends Model {}

ChatReaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    emoji: { type: DataTypes.STRING(16), allowNull: false },
  },
  {
    sequelize,
    modelName: 'ChatReaction',
    tableName: 'chat_reactions',
    indexes: [{ unique: true, fields: ['message_id', 'user_id', 'emoji'] }, { fields: ['project_id'] }],
  },
);

/** A file shared in project chat: uploaded first, then attached when the message is sent. */
export class ChatFile extends Model {
  toJSON() {
    const { storageKey: _storageKey, ...values } = this.get();
    return values;
  }
}

ChatFile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: true },
    uploaderId: { type: DataTypes.UUID, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(255), allowNull: false },
  },
  {
    sequelize,
    modelName: 'ChatFile',
    tableName: 'chat_files',
    indexes: [{ fields: ['project_id', 'created_at'] }, { fields: ['message_id'] }],
  },
);
