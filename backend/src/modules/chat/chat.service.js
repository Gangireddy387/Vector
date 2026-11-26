import { Op } from 'sequelize';
import { ChatFile, ChatMessage, ChatMessageIssue, ChatReaction, Issue, Project, ProjectMember, StandupUpdate, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToProject, emitToUser } from '../../shared/realtime/socket.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { extractMentionIds } from '../comments/comment.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { buildAssistantReply, parseAssistantRequest } from './chat.assistant.js';
import { CHAT_REACTION_EMOJIS } from './chat.model.js';
import { chatFileView } from './chat.files.js';

const messageInclude = [
  { model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES },
  {
    model: Issue,
    as: 'issues',
    attributes: ['id', 'key', 'title', 'type', 'priority', 'projectId', 'assigneeId'],
    through: { attributes: [] },
    include: [{ model: Status, as: 'status', attributes: ['name', 'color', 'category'] }],
  },
];

const plain = (body) => body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi, '@$1').replace(/\s+/g, ' ').trim().slice(0, 240);

/** Standup drafts / the `/standup` request itself stay with the requester until they save. */
export function isPrivateChatMessage(message) {
  return Boolean(message?.meta?.private);
}

export function canViewChatMessage(message, viewerId) {
  if (!isPrivateChatMessage(message)) return true;
  const ownerId = message.meta?.forUserId ?? message.authorId ?? message.meta?.requestedBy?.id ?? null;
  return Boolean(viewerId && ownerId && ownerId === viewerId);
}

async function reactionsFor(messageIds) {
  if (!messageIds.length) return new Map();
  const rows = await ChatReaction.findAll({ where: { messageId: messageIds }, attributes: ['messageId', 'emoji', 'userId'], raw: true });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    const existing = list.find((item) => item.emoji === row.emoji);
    if (existing) existing.userIds.push(row.userId);
    else list.push({ emoji: row.emoji, userIds: [row.userId] });
    map.set(row.messageId, list);
  }
  const order = (emoji) => (CHAT_REACTION_EMOJIS.includes(emoji) ? CHAT_REACTION_EMOJIS.indexOf(emoji) : CHAT_REACTION_EMOJIS.length);
  for (const [id, list] of map) map.set(id, list.sort((a, b) => order(a.emoji) - order(b.emoji)));
  return map;
}

async function decorate(messages) {
  const plainMessages = messages.map((message) => (message.toJSON ? message.toJSON() : message));
  const ids = plainMessages.map((message) => message.id);
  const [reactions, files] = await Promise.all([
    reactionsFor(ids),
    ids.length ? ChatFile.findAll({ where: { messageId: ids }, order: [['createdAt', 'ASC']] }) : [],
  ]);
  const filesOf = new Map();
  for (const file of files) filesOf.set(file.messageId, [...(filesOf.get(file.messageId) ?? []), chatFileView(file)]);
  return plainMessages.map((message) => ({
    ...message,
    reactions: reactions.get(message.id) ?? [],
    files: filesOf.get(message.id) ?? [],
  }));
}

const loadMessage = async (id) => {
  const message = await ChatMessage.findByPk(id, { include: messageInclude });
  if (!message) return null;
  return (await decorate([message]))[0];
};

export async function listMessages(projectId, viewerId, { before, limit = 50 } = {}) {
  const where = { projectId, parentId: null };
  if (before) where.createdAt = { [Op.lt]: new Date(before) };
  // Over-fetch a little so private drafts hidden from others do not thin the page too much.
  const rows = await ChatMessage.findAll({
    where,
    include: messageInclude,
    order: [['createdAt', 'DESC']],
    limit: limit + 20,
  });
  // Hide leftover private standup drafts after that person already posted for that day.
  const postedDates = new Set(
    (
      await StandupUpdate.findAll({
        where: { projectId, userId: viewerId },
        attributes: ['date'],
        raw: true,
      })
    ).map((row) => String(row.date).slice(0, 10)),
  );
  const keep = (message) => {
    const plainMessage = message.toJSON ? message.toJSON() : message;
    if (!canViewChatMessage(plainMessage, viewerId)) return false;
    if (plainMessage.kind === 'bot' && plainMessage.meta?.type === 'standup_draft' && plainMessage.meta.forUserId === viewerId) {
      return !postedDates.has(String(plainMessage.meta.date ?? '').slice(0, 10));
    }
    return true;
  };
  const visiblePosts = rows.filter((row) => keep(row)).slice(0, limit + 1);
  const posts = visiblePosts.slice(0, limit).reverse();
  const postIds = posts.map((row) => row.id);
  const replies = postIds.length
    ? await ChatMessage.findAll({
        where: { projectId, parentId: postIds },
        include: messageInclude,
        order: [['createdAt', 'ASC']],
      })
    : [];
  const decorated = await decorate([...posts, ...replies]);
  const visible = decorated.filter((message) => keep(message));
  const byId = new Map(visible.map((message) => [message.id, message]));
  return {
    messages: posts.map((post) => byId.get(post.id)).filter(Boolean),
    replies: replies.map((reply) => byId.get(reply.id)).filter(Boolean),
    hasMore: visiblePosts.length > limit,
  };
}

/** People mentioned with @ and owners of the tasks referenced in the message hear about it. */
async function notifyAudience(project, author, message, issues) {
  const mentionCandidates = extractMentionIds(message.body);
  const mentioned = mentionCandidates.length
    ? (await ProjectMember.findAll({ where: { projectId: project.id, userId: mentionCandidates }, attributes: ['userId'], raw: true })).map((row) => row.userId)
    : [];
  const link = `/projects/${project.id}/chat?message=${message.parentId ?? message.id}`;
  if (mentioned.length) {
    await notifyUsers({ userIds: mentioned, actorId: author.id, type: 'chat_mention', title: `${author.name} mentioned you in ${project.name} chat`, body: plain(message.body), link, projectId: project.id, email: false });
  }
  for (const issue of issues) {
    if (!issue.assigneeId || mentioned.includes(issue.assigneeId)) continue;
    await notifyUsers({
      userIds: [issue.assigneeId],
      actorId: author.id,
      type: 'chat_task',
      title: `${author.name} mentioned ${issue.key} in ${project.name} chat`,
      body: plain(message.body),
      link,
      issueId: issue.id,
      projectId: project.id,
      email: false,
    });
  }
}

export async function postMessage(projectId, author, { body, parentId = null, fileIds = [] }) {
  if (!body?.trim() && !fileIds.length) throw ApiError.badRequest('Write a message or attach a file');
  const project = await Project.findByPk(projectId, { attributes: ['id', 'name', 'key'] });
  let parent = null;
  if (parentId) {
    parent = await ChatMessage.findOne({ where: { id: parentId, projectId }, attributes: ['id', 'parentId', 'kind'] });
    if (!parent || parent.parentId || parent.kind !== 'user') throw ApiError.badRequest('Reply to a top-level message in this chat');
  }

  const issues = body?.trim() ? await resolveIssueRefs(author.id, body) : [];
  // `/standup` is a private request — teammates should not see the bare command as if they posted.
  const assistantRequest = !parent ? parseAssistantRequest(body || '') : null;
  const privateRequest = assistantRequest?.command === 'standup';
  const message = await ChatMessage.create({
    projectId,
    authorId: author.id,
    parentId: parent?.id ?? null,
    body: body?.trim() || (fileIds.length ? 'Shared a file' : ''),
    meta: privateRequest ? { private: true, forUserId: author.id, type: 'assistant_request', command: 'standup' } : null,
  });
  if (issues.length) await message.setIssues(issues);

  if (fileIds.length) {
    const files = await ChatFile.findAll({ where: { id: fileIds, projectId, uploaderId: author.id, messageId: null } });
    if (files.length !== fileIds.length) throw ApiError.badRequest('One or more files could not be attached');
    await ChatFile.update({ messageId: message.id }, { where: { id: files.map((file) => file.id) } });
  }

  const full = await loadMessage(message.id);
  if (privateRequest) emitToUser(author.id, 'chat:message', full);
  else emitToProject(projectId, 'chat:message', full);
  if (!privateRequest) await notifyAudience(project, author, { ...message.toJSON(), parentId: message.parentId }, issues);

  let reply = null;
  if (!parent) {
    try {
      const assistant = await buildAssistantReply(projectId, author, body || '');
      if (assistant) {
        const botMessage = await ChatMessage.create({
          projectId,
          authorId: null,
          kind: 'bot',
          body: assistant.body,
          meta: { ...assistant.meta, replyTo: message.id, requestedBy: { id: author.id, name: author.name } },
        });
        const botIssues = (assistant.meta.issues ?? []).map((issue) => issue.id).filter(Boolean);
        if (botIssues.length) await botMessage.setIssues(botIssues);
        reply = await loadMessage(botMessage.id);
        // Project room is what Work chat is already in; clients hide private drafts from others.
        // Also nudge the requester's user room in case they have chat open in another tab.
        emitToProject(projectId, 'chat:message', reply);
        if (assistant.meta?.private) emitToUser(author.id, 'chat:message', reply);
      }
    } catch (error) {
      console.warn('[chat] assistant reply failed:', error?.message ?? error);
    }
  }
  return { message: full, reply };
}

async function loadOwnMessage(messageId, userId, { allowAdmin = false } = {}) {
  const message = await ChatMessage.findByPk(messageId);
  if (!message) throw ApiError.notFound('Message not found');
  const membership = await assertProjectRole(message.projectId, userId);
  const isAuthor = message.authorId === userId;
  if (!isAuthor && !(allowAdmin && membership.role === 'admin')) throw ApiError.forbidden('Only the author can change this message');
  return message;
}

export async function editMessage(messageId, user, body) {
  const message = await loadOwnMessage(messageId, user.id);
  if (message.kind !== 'user') throw ApiError.badRequest('Assistant messages cannot be edited');
  await message.update({ body, editedAt: new Date() });
  await message.setIssues(await resolveIssueRefs(user.id, body));
  const full = await loadMessage(message.id);
  emitToProject(message.projectId, 'chat:updated', full);
  return full;
}

export async function deleteMessage(messageId, user) {
  const message = await loadOwnMessage(messageId, user.id, { allowAdmin: true });
  await ChatFile.destroy({ where: { messageId: message.id } });
  await ChatReaction.destroy({ where: { messageId: message.id } });
  await ChatMessage.destroy({ where: { parentId: message.id } });
  await message.destroy();
  emitToProject(message.projectId, 'chat:deleted', { id: message.id, projectId: message.projectId });
}

/** Project admins can wipe the whole Work chat thread for everyone. */
export async function clearProjectChat(projectId, userId) {
  await assertProjectRole(projectId, userId, 'admin');
  const ids = (await ChatMessage.findAll({ where: { projectId }, attributes: ['id'], raw: true })).map((row) => row.id);
  if (ids.length) {
    await ChatReaction.destroy({ where: { messageId: ids } });
    await ChatFile.destroy({ where: { messageId: ids } });
    await ChatMessageIssue.destroy({ where: { messageId: ids } });
    await ChatMessage.destroy({ where: { projectId } });
  }
  // Orphan uploads that never got attached.
  await ChatFile.destroy({ where: { projectId } });
  emitToProject(projectId, 'chat:cleared', { projectId, clearedBy: userId });
  return { cleared: ids.length };
}

export async function toggleReaction(user, messageId, emoji) {
  if (!CHAT_REACTION_EMOJIS.includes(emoji)) throw ApiError.badRequest('Unsupported reaction');
  const message = await ChatMessage.findByPk(messageId);
  if (!message) throw ApiError.notFound('Message not found');
  await assertProjectRole(message.projectId, user.id);
  const existing = await ChatReaction.findOne({ where: { messageId, userId: user.id, emoji } });
  if (existing) await existing.destroy();
  else await ChatReaction.create({ projectId: message.projectId, messageId, userId: user.id, emoji });
  const reactions = (await reactionsFor([messageId])).get(messageId) ?? [];
  emitToProject(message.projectId, 'chat:reactions', { messageId, projectId: message.projectId, reactions });
  return { messageId, reactions };
}

/** Lines of a standup section that mention the task, so the record shows what was said about it. */
const linesAbout = (text, key) => (text ? text.split('\n').filter((line) => line.toUpperCase().includes(key)).map((line) => line.replace(/^\s*[-*]\s*/, '').trim()) : []);

/** The task's follow-up record: every chat message and standup update that mentioned it, newest first. */
export async function listIssueFollowups(issue) {
  const [messages, standups] = await Promise.all([
    ChatMessage.findAll({
      include: [
        { model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES },
        { model: Issue, as: 'issues', attributes: [], through: { attributes: [] }, where: { id: issue.id }, required: true },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    }),
    StandupUpdate.findAll({
      where: { projectId: issue.projectId },
      include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
      order: [['date', 'DESC']],
      limit: 500,
    }),
  ]);

  const followups = [
    ...messages.map((message) => ({
      type: 'chat',
      id: message.id,
      at: message.createdAt,
      kind: message.kind,
      author: message.author,
      body: message.body,
      projectId: message.projectId,
    })),
    ...standups
      .filter((standup) => (standup.issueIds ?? []).includes(issue.id))
      .map((standup) => ({
        type: 'standup',
        id: standup.id,
        at: standup.updatedAt,
        date: standup.date,
        author: standup.user,
        projectId: standup.projectId,
        sections: {
          yesterday: linesAbout(standup.yesterday, issue.key),
          today: linesAbout(standup.today, issue.key),
          blockers: linesAbout(standup.blockers, issue.key),
        },
      })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return { followups };
}
