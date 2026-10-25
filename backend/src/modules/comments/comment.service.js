import { Comment, IssueWatcher, ProjectMember, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { logActivity } from '../activity/activity.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/** Mentions are stored inline as `@[Display Name](user-uuid)`. */
const MENTION_PATTERN = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;

export const extractMentionIds = (body) => [...new Set([...String(body).matchAll(MENTION_PATTERN)].map((match) => match[1]))];

const authorInclude = [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }];

export const listComments = (issueId) =>
  Comment.findAll({ where: { issueId }, include: authorInclude, order: [['createdAt', 'ASC']] });

export async function createComment(issue, author, body, context = {}) {
  const comment = await Comment.create({ issueId: issue.id, authorId: author?.id ?? null, body });
  if (author) await IssueWatcher.bulkCreate([{ issueId: issue.id, userId: author.id }], { ignoreDuplicates: true });

  const mentionCandidates = extractMentionIds(body);
  const mentionedMembers = mentionCandidates.length
    ? await ProjectMember.findAll({ where: { projectId: issue.projectId, userId: mentionCandidates }, attributes: ['userId'], raw: true })
    : [];

  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: author?.id ?? null,
    action: 'commented',
    meta: { commentId: comment.id, source: context.source ?? 'user', ruleName: context.ruleName ?? null },
  });

  eventBus.publish(DomainEvents.COMMENT_CREATED, {
    issue: issue.toJSON(),
    comment: comment.toJSON(),
    mentionedUserIds: mentionedMembers.map((member) => member.userId),
    actorId: author?.id ?? null,
    context,
  });
  return Comment.findByPk(comment.id, { include: authorInclude });
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
  return Comment.findByPk(comment.id, { include: authorInclude });
}

export async function deleteComment(commentId, userId) {
  const comment = await loadOwnedComment(commentId, userId, { allowProjectAdmin: true });
  await comment.destroy();
}
