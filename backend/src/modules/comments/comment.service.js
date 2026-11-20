import { Comment, CommentReaction, IssueWatcher, ProjectMember, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { logActivity } from '../activity/activity.service.js';
import { attachmentsForComments, deleteAttachmentsForComments } from '../attachments/attachment.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { COMMENT_REACTION_EMOJIS } from './comment.model.js';

/** Mentions are stored inline as `@[Display Name](user-uuid)`. */
const MENTION_PATTERN = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;

export const extractMentionIds = (body) => [...new Set([...String(body).matchAll(MENTION_PATTERN)].map((match) => match[1]))];

const authorInclude = [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }];

async function reactionsFor(commentIds) {
  if (!commentIds.length) return new Map();
  const rows = await CommentReaction.findAll({
    where: { commentId: commentIds },
    attributes: ['commentId', 'emoji', 'userId'],
    raw: true,
  });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.commentId) ?? [];
    const existing = list.find((item) => item.emoji === row.emoji);
    if (existing) existing.userIds.push(row.userId);
    else list.push({ emoji: row.emoji, userIds: [row.userId] });
    map.set(row.commentId, list);
  }
  const order = (emoji) =>
    COMMENT_REACTION_EMOJIS.includes(emoji) ? COMMENT_REACTION_EMOJIS.indexOf(emoji) : COMMENT_REACTION_EMOJIS.length;
  for (const [id, list] of map) map.set(id, list.sort((a, b) => order(a.emoji) - order(b.emoji)));
  return map;
}

function decorateComment(row, reactionMap, attachmentMap = new Map()) {
  const json = row.toJSON ? row.toJSON() : { ...row };
  return {
    ...json,
    reactions: reactionMap.get(json.id) ?? [],
    attachments: (attachmentMap.get(json.id) ?? []).map((file) => (file.toJSON ? file.toJSON() : file)),
  };
}

/** Roots with nested replies (ASC), each with reaction chips and file attachments. */
export async function listComments(issueId) {
  const rows = await Comment.findAll({
    where: { issueId },
    include: authorInclude,
    order: [['createdAt', 'ASC']],
  });
  const ids = rows.map((row) => row.id);
  const [reactionMap, attachmentMap] = await Promise.all([reactionsFor(ids), attachmentsForComments(ids)]);
  const decorated = rows.map((row) => decorateComment(row, reactionMap, attachmentMap));
  const roots = [];
  const repliesByParent = new Map();
  for (const comment of decorated) {
    if (comment.parentId) {
      const list = repliesByParent.get(comment.parentId) ?? [];
      list.push({ ...comment, replies: undefined });
      repliesByParent.set(comment.parentId, list);
    } else {
      roots.push(comment);
    }
  }
  return roots.map((root) => ({
    ...root,
    replies: repliesByParent.get(root.id) ?? [],
  }));
}

/**
 * Create a comment or a one-level reply.
 * `parentId` may be passed via `context.parentId` (HTTP) without breaking string-body callers.
 */
export async function createComment(issue, author, body, context = {}) {
  const parentId = context.parentId ?? null;
  let parent = null;
  if (parentId) {
    parent = await Comment.findOne({ where: { id: parentId, issueId: issue.id }, attributes: ['id', 'parentId'] });
    if (!parent) throw ApiError.badRequest('Reply to a comment on this task');
    if (parent.parentId) throw ApiError.badRequest('Replies can only be one level deep');
  }

  const comment = await Comment.create({
    issueId: issue.id,
    authorId: author?.id ?? null,
    guestAuthorName: author ? null : (context.guestAuthorName ?? null),
    parentId: parent?.id ?? null,
    body,
  });
  if (author) await IssueWatcher.bulkCreate([{ issueId: issue.id, userId: author.id }], { ignoreDuplicates: true });

  const mentionCandidates = extractMentionIds(body);
  const mentionedMembers = mentionCandidates.length
    ? await ProjectMember.findAll({
        where: { projectId: issue.projectId, userId: mentionCandidates },
        attributes: ['userId'],
        raw: true,
      })
    : [];

  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: author?.id ?? null,
    action: 'commented',
    meta: {
      commentId: comment.id,
      parentId: comment.parentId,
      source: context.source ?? 'user',
      ruleName: context.ruleName ?? null,
    },
  });

  eventBus.publish(DomainEvents.COMMENT_CREATED, {
    issue: issue.toJSON(),
    comment: comment.toJSON(),
    mentionedUserIds: mentionedMembers.map((member) => member.userId),
    actorId: author?.id ?? null,
    context,
  });

  const loaded = await Comment.findByPk(comment.id, { include: authorInclude });
  return { ...decorateComment(loaded, new Map(), new Map()), replies: parent ? undefined : [], attachments: [] };
}

async function loadOwnedComment(commentId, userId, { allowProjectAdmin = false } = {}) {
  const comment = await Comment.findByPk(commentId, { include: ['issue'] });
  if (!comment) throw ApiError.notFound('Comment not found');
  const membership = await assertProjectRole(comment.issue.projectId, userId);
  const isAuthor = comment.authorId === userId;
  if (!isAuthor && !(allowProjectAdmin && membership.role === 'admin')) {
    throw ApiError.forbidden('Only the author can change this comment');
  }
  return comment;
}

export async function updateComment(commentId, userId, body) {
  const comment = await loadOwnedComment(commentId, userId);
  await comment.update({ body, editedAt: new Date() });
  const loaded = await Comment.findByPk(comment.id, { include: authorInclude });
  const reactions = (await reactionsFor([comment.id])).get(comment.id) ?? [];
  return { ...decorateComment(loaded, new Map([[comment.id, reactions]])), replies: comment.parentId ? undefined : [] };
}

export async function deleteComment(commentId, userId) {
  const comment = await loadOwnedComment(commentId, userId, { allowProjectAdmin: true });
  const replyIds = (
    await Comment.findAll({ where: { parentId: comment.id }, attributes: ['id'], raw: true })
  ).map((row) => row.id);
  const allIds = [comment.id, ...replyIds];
  await deleteAttachmentsForComments(allIds);
  await CommentReaction.destroy({ where: { commentId: allIds } });
  if (replyIds.length) await Comment.destroy({ where: { id: replyIds } });
  await comment.destroy();
}

export async function toggleReaction(userId, commentId, emoji) {
  if (!COMMENT_REACTION_EMOJIS.includes(emoji)) throw ApiError.badRequest('Unsupported reaction');
  const comment = await Comment.findByPk(commentId, { include: ['issue'] });
  if (!comment) throw ApiError.notFound('Comment not found');
  await assertProjectRole(comment.issue.projectId, userId);

  const existing = await CommentReaction.findOne({ where: { commentId, userId, emoji } });
  if (existing) await existing.destroy();
  else await CommentReaction.create({ commentId, userId, emoji });

  const reactions = (await reactionsFor([commentId])).get(commentId) ?? [];
  return { commentId, reactions };
}
