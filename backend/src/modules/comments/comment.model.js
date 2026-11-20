import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Same fixed set as project chat / DMs — keep UI and validation in sync. */
export const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export class Comment extends Model {}

Comment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    /** Display name when the author is a public-share guest (authorId null). */
    guestAuthorName: { type: DataTypes.STRING(80), allowNull: true },
    /** Reply to a top-level comment (one level only). */
    parentId: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Comment',
    tableName: 'comments',
    indexes: [{ fields: ['issue_id'] }, { fields: ['parent_id'] }],
  },
);

/** One person's emoji reaction on an issue comment. */
export class CommentReaction extends Model {}

CommentReaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    commentId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    emoji: { type: DataTypes.STRING(16), allowNull: false },
  },
  {
    sequelize,
    modelName: 'CommentReaction',
    tableName: 'comment_reactions',
    indexes: [{ unique: true, fields: ['comment_id', 'user_id', 'emoji'] }],
  },
);
