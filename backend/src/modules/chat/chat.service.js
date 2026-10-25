import { Op } from 'sequelize';
import { ChatMessage, Issue, Project, ProjectMember, StandupUpdate, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToProject } from '../../shared/realtime/socket.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { extractMentionIds } from '../comments/comment.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { buildAssistantReply } from './chat.assistant.js';

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

const loadMessage = (id) => ChatMessage.findByPk(id, { include: messageInclude });
const plain = (body) => body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi, '@$1').replace(/\s+/g, ' ').trim().slice(0, 240);

export async function listMessages(projectId, { before, limit = 50 }) {
  const where = { projectId };
  if (before) where.createdAt = { [Op.lt]: new Date(before) };
  const rows = await ChatMessage.findAll({ where, include: messageInclude, order: [['createdAt', 'DESC']], limit: limit + 1 });
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

/** People mentioned with @ and owners of the tasks referenced in the message hear about it. */
async function notifyAudience(project, author, message, issues) {
  const mentionCandidates = extractMentionIds(message.body);
  const mentioned = mentionCandidates.length
    ? (await ProjectMember.findAll({ where: { projectId: project.id, userId: mentionCandidates }, attributes: ['userId'], raw: true })).map((row) => row.userId)
    : [];
  const link = `/projects/${project.id}/chat?message=${message.id}`;
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

export async function postMessage(projectId, author, body) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'name', 'key'] });
  const issues = await resolveIssueRefs(author.id, body);
  const message = await ChatMessage.create({ projectId, authorId: author.id, body });
  if (issues.length) await message.setIssues(issues);

  const full = await loadMessage(message.id);
  emitToProject(projectId, 'chat:message', full.toJSON());
  await notifyAudience(project, author, message, issues);

  let reply = null;
  const assistant = await buildAssistantReply(projectId, author, body);
  if (assistant) {
    const botMessage = await ChatMessage.create({ projectId, authorId: null, kind: 'bot', body: assistant.body, meta: { ...assistant.meta, replyTo: message.id, requestedBy: { id: author.id, name: author.name } } });
    const botIssues = (assistant.meta.issues ?? []).map((issue) => issue.id).filter(Boolean);
    if (botIssues.length) await botMessage.setIssues(botIssues);
    reply = await loadMessage(botMessage.id);
    emitToProject(projectId, 'chat:message', reply.toJSON());
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
  emitToProject(message.projectId, 'chat:updated', full.toJSON());
  return full;
}

export async function deleteMessage(messageId, user) {
  const message = await loadOwnMessage(messageId, user.id, { allowAdmin: true });
  await message.destroy();
  emitToProject(message.projectId, 'chat:deleted', { id: message.id });
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
