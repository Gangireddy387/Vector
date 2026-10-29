import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const CONVERSATION_KINDS = ['direct', 'team', 'department'];

/**
 * A chat inside an organization: a private one-to-one conversation (`direct`), or the group chat of a team or a
 * department. Group chats include whoever belongs to the team or department at the moment.
 */
export class Conversation extends Model {}

Conversation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(12), allowNull: false },
    teamId: { type: DataTypes.UUID, allowNull: true },
    departmentId: { type: DataTypes.UUID, allowNull: true },
    /** Direct chats: both user ids, sorted and joined, so a pair only ever has one conversation. */
    directKey: { type: DataTypes.STRING(80), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Conversation',
    tableName: 'conversations',
    indexes: [
      { unique: true, fields: ['organization_id', 'direct_key'] },
      { unique: true, fields: ['team_id'] },
      { unique: true, fields: ['department_id'] },
    ],
  },
);

/** Someone's place in a conversation: the two people of a direct chat, and when each person last read any chat. */
export class ConversationMember extends Model {}

ConversationMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    lastReadAt: { type: DataTypes.DATE, allowNull: true },
    /** "Clear chat": this person no longer sees messages sent before this moment; others keep theirs. */
    clearedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ConversationMember',
    tableName: 'conversation_members',
    indexes: [{ unique: true, fields: ['conversation_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);

export class ConversationMessage extends Model {}

ConversationMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    /** Deleted for everyone by its author; the bubble says so. */
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    /** Last changed by its author; the bubble says "edited". */
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ConversationMessage',
    tableName: 'conversation_messages',
    indexes: [{ fields: ['conversation_id', 'created_at'] }],
  },
);

/** "Delete for me": a message one person removed from their own view; everyone else still sees it. */
export class ConversationHiddenMessage extends Model {}

ConversationHiddenMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ConversationHiddenMessage',
    tableName: 'conversation_hidden_messages',
    indexes: [{ unique: true, fields: ['message_id', 'user_id'] }, { fields: ['user_id', 'conversation_id'] }],
  },
);
