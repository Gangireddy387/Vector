import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const CONVERSATION_KINDS = ['direct', 'team', 'department', 'channel'];

/**
 * A chat inside an organization: a private one-to-one conversation (`direct`), the group chat of a team (its
 * "General" channel) or a department, or one of a team's other channels. Group chats include whoever belongs to the
 * team or department at the moment.
 */
export class Conversation extends Model {}

Conversation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(12), allowNull: false },
    teamId: { type: DataTypes.UUID, allowNull: true },
    departmentId: { type: DataTypes.UUID, allowNull: true },
    channelId: { type: DataTypes.UUID, allowNull: true },
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
      { unique: true, fields: ['channel_id'] },
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
    /** Muted: new messages make no sound and do not add to the unread badge (mentions still notify). */
    mutedAt: { type: DataTypes.DATE, allowNull: true },
    /**
     * Teams-style alerts for this chat: `all` (default), `mentions` (sound/badge off; @mentions still notify),
     * `none` (everything quiet, including @mentions). `mutedAt` stays in sync for older clients.
     */
    notifyLevel: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'all' },
  },
  {
    sequelize,
    modelName: 'ConversationMember',
    tableName: 'conversation_members',
    indexes: [{ unique: true, fields: ['conversation_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);

export const NOTIFY_LEVELS = ['all', 'mentions', 'none'];

export class ConversationMessage extends Model {}

ConversationMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    /** Group chats: the post this message replies to (one level, like Teams threads); null for posts. */
    parentId: { type: DataTypes.UUID, allowNull: true },
    /** Group chat posts: an optional headline, like a Teams announcement. */
    subject: { type: DataTypes.STRING(150), allowNull: true },
    /** Group chat posts marked "Important" by their author. */
    important: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    /** Group chat posts pinned to the top of the conversation, and by whom. */
    pinnedAt: { type: DataTypes.DATE, allowNull: true },
    pinnedById: { type: DataTypes.UUID, allowNull: true },
    /** Deleted for everyone by its author; the bubble says so. */
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    /** Last changed by its author; the bubble says "edited". */
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ConversationMessage',
    tableName: 'conversation_messages',
    indexes: [{ fields: ['conversation_id', 'created_at'] }, { fields: ['parent_id'] }],
  },
);

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

/** One person's reaction to a message (each emoji at most once per person). */
export class ConversationReaction extends Model {}

ConversationReaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    emoji: { type: DataTypes.STRING(16), allowNull: false },
  },
  {
    sequelize,
    modelName: 'ConversationReaction',
    tableName: 'conversation_reactions',
    indexes: [{ unique: true, fields: ['message_id', 'user_id', 'emoji'] }, { fields: ['conversation_id'] }],
  },
);

/** A file shared in a conversation: uploaded first, then attached to the message that shares it. */
export class ConversationFile extends Model {
  toJSON() {
    const { storageKey: _storageKey, ...values } = this.get();
    return values;
  }
}

ConversationFile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    /** Null until it is sent with a message. */
    messageId: { type: DataTypes.UUID, allowNull: true },
    uploaderId: { type: DataTypes.UUID, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(255), allowNull: false },
  },
  {
    sequelize,
    modelName: 'ConversationFile',
    tableName: 'conversation_files',
    indexes: [{ fields: ['conversation_id', 'created_at'] }, { fields: ['message_id'] }],
  },
);

/** A message someone saved to find again later (Teams "Save this message"); private to them. */
export class ConversationSavedMessage extends Model {}

ConversationSavedMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ConversationSavedMessage',
    tableName: 'conversation_saved_messages',
    indexes: [{ unique: true, fields: ['user_id', 'message_id'] }],
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

/** Previous body/subject of a message, kept when the author edits it (Teams-style edit history). */
export class ConversationMessageRevision extends Model {}

ConversationMessageRevision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    messageId: { type: DataTypes.UUID, allowNull: false },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    editorId: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    subject: { type: DataTypes.STRING(150), allowNull: true },
  },
  {
    sequelize,
    modelName: 'ConversationMessageRevision',
    tableName: 'conversation_message_revisions',
    updatedAt: false,
    indexes: [{ fields: ['message_id', 'created_at'] }],
  },
);

/** A shared markdown doc on a team chat or channel (Docs tab / Loop-style notes). */
export class ConversationDoc extends Model {}

ConversationDoc.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    createdById: { type: DataTypes.UUID, allowNull: true },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ConversationDoc',
    tableName: 'conversation_docs',
    indexes: [{ fields: ['conversation_id', 'updated_at'] }],
  },
);

/** A poll attached to a channel post. */
export class ConversationPoll extends Model {}

ConversationPoll.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    question: { type: DataTypes.STRING(200), allowNull: false },
    /** Answer labels, in order. */
    options: { type: DataTypes.JSON, allowNull: false },
    /** userId → chosen option index. */
    votes: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'open' },
  },
  {
    sequelize,
    modelName: 'ConversationPoll',
    tableName: 'conversation_polls',
    indexes: [{ unique: true, fields: ['message_id'] }, { fields: ['conversation_id'] }],
  },
);

/** An approval request attached to a channel post (approve / reject). */
export class ConversationApproval extends Model {}

ConversationApproval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversationId: { type: DataTypes.UUID, allowNull: false },
    messageId: { type: DataTypes.UUID, allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(150), allowNull: false },
    /** userId → `approved` | `rejected`. */
    responses: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
  },
  {
    sequelize,
    modelName: 'ConversationApproval',
    tableName: 'conversation_approvals',
    indexes: [{ unique: true, fields: ['message_id'] }, { fields: ['conversation_id'] }],
  },
);
