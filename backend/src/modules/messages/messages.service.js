import { Op } from 'sequelize';
import {
  Conversation,
  ConversationHiddenMessage,
  ConversationMember,
  ConversationMessage,
  Department,
  OrganizationMember,
  Team,
  TeamMember,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser, isUserOnline } from '../../shared/realtime/socket.js';
import { assertFeature, entitlementsFor } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const THREAD_LIMIT = 300;
const authorInclude = [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }];
/** Which plan switch a kind of conversation needs. */
const FEATURE_FOR = { direct: 'directMessages', team: 'teamChat', department: 'teamChat' };

/*
 * Every function takes the `viewer`: { id, organization (loaded with its plan), isAdmin }.
 * Organization admins can open every team and department chat; direct chats are only ever visible to their two people.
 */

const adminIdsOf = async (organizationId) =>
  (await OrganizationMember.findAll({ where: { organizationId, role: 'admin', status: 'active' }, attributes: ['userId'], raw: true })).map((row) => row.userId);

async function teamPeople(team) {
  const members = (await TeamMember.findAll({ where: { teamId: team.id }, attributes: ['userId'], raw: true })).map((row) => row.userId);
  const department = await Department.findByPk(team.departmentId, { attributes: ['headId'], raw: true });
  return [...members, team.leadId, department?.headId].filter(Boolean);
}

async function departmentPeople(department) {
  const teams = await Team.findAll({ where: { departmentId: department.id }, attributes: ['id', 'leadId'], raw: true });
  const members = teams.length ? (await TeamMember.findAll({ where: { teamId: teams.map((team) => team.id) }, attributes: ['userId'], raw: true })).map((row) => row.userId) : [];
  return [...members, ...teams.map((team) => team.leadId), department.headId].filter(Boolean);
}

/** Everyone who can read a conversation right now (group chats follow team and department membership). */
async function participantIds(conversation) {
  if (conversation.kind === 'direct') {
    return (await ConversationMember.findAll({ where: { conversationId: conversation.id }, attributes: ['userId'], raw: true })).map((row) => row.userId);
  }
  const admins = await adminIdsOf(conversation.organizationId);
  if (conversation.kind === 'team') {
    const team = await Team.findByPk(conversation.teamId);
    return team ? [...new Set([...(await teamPeople(team)), ...admins])] : [];
  }
  const department = await Department.findByPk(conversation.departmentId);
  return department ? [...new Set([...(await departmentPeople(department)), ...admins])] : [];
}

async function loadConversation(viewer, conversationId) {
  const conversation = await Conversation.findOne({ where: { id: conversationId, organizationId: viewer.organization.id } });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  assertFeature(viewer.organization, FEATURE_FOR[conversation.kind]);
  const people = await participantIds(conversation);
  if (!people.includes(viewer.id)) throw ApiError.notFound('Conversation not found');
  return { conversation, people };
}

const broadcast = (people, event, payload) => people.forEach((userId) => emitToUser(userId, event, payload));

/** The team and department chats this person belongs to (all of them for organization admins), created on first use. */
async function groupConversations(viewer) {
  const organizationId = viewer.organization.id;
  let teams;
  let departments;
  if (viewer.isAdmin) {
    teams = await Team.findAll({ where: { organizationId } });
    departments = await Department.findAll({ where: { organizationId } });
  } else {
    const memberTeamIds = (await TeamMember.findAll({ where: { userId: viewer.id }, attributes: ['teamId'], raw: true })).map((row) => row.teamId);
    const headed = await Department.findAll({ where: { organizationId, headId: viewer.id } });
    teams = await Team.findAll({
      where: { organizationId, [Op.or]: [{ id: memberTeamIds }, { leadId: viewer.id }, { departmentId: headed.map((department) => department.id) }] },
    });
    const departmentIds = new Set([...headed.map((department) => department.id), ...teams.map((team) => team.departmentId)]);
    departments = departmentIds.size ? await Department.findAll({ where: { organizationId, id: [...departmentIds] } }) : [];
  }

  const conversations = [];
  for (const team of teams) {
    const [conversation] = await Conversation.findOrCreate({ where: { teamId: team.id }, defaults: { organizationId, kind: 'team', teamId: team.id } });
    conversations.push({ conversation, team, department: departments.find((department) => department.id === team.departmentId) ?? null });
  }
  for (const department of departments) {
    const [conversation] = await Conversation.findOrCreate({
      where: { departmentId: department.id },
      defaults: { organizationId, kind: 'department', departmentId: department.id },
    });
    conversations.push({ conversation, department });
  }
  return conversations;
}

async function directConversations(viewer) {
  const memberships = await ConversationMember.findAll({ where: { userId: viewer.id }, attributes: ['conversationId'], raw: true });
  if (!memberships.length) return [];
  const conversations = await Conversation.findAll({
    where: { id: memberships.map((row) => row.conversationId), organizationId: viewer.organization.id, kind: 'direct' },
  });
  return conversations.map((conversation) => ({ conversation }));
}

/** List entry: title, the other person (direct chats), last message and how many messages are unread. */
/** Messages this person still sees: those after they last cleared the chat, minus those they deleted for themselves. */
async function visibleTo(viewer, conversationId, membership) {
  const hidden = (await ConversationHiddenMessage.findAll({ where: { conversationId, userId: viewer.id }, attributes: ['messageId'], raw: true })).map((row) => row.messageId);
  return {
    ...(membership?.clearedAt ? { createdAt: { [Op.gt]: membership.clearedAt } } : {}),
    ...(hidden.length ? { id: { [Op.notIn]: hidden } } : {}),
  };
}

async function summarize(viewer, { conversation, team = null, department = null }, people = null) {
  const membership = await ConversationMember.findOne({ where: { conversationId: conversation.id, userId: viewer.id } });
  const visible = await visibleTo(viewer, conversation.id, membership);
  const lastMessage = await ConversationMessage.findOne({
    where: { conversationId: conversation.id, ...visible },
    include: authorInclude,
    order: [['createdAt', 'DESC']],
  });
  const unread = await ConversationMessage.count({
    where: {
      conversationId: conversation.id,
      deletedAt: null,
      authorId: { [Op.ne]: viewer.id },
      ...(visible.id ? { id: visible.id } : {}),
      ...(membership?.lastReadAt ? { createdAt: { [Op.gt]: membership.lastReadAt } } : {}),
    },
  });

  const base = {
    id: conversation.id,
    kind: conversation.kind,
    unread,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          body: lastMessage.deletedAt ? '' : lastMessage.body,
          deleted: Boolean(lastMessage.deletedAt),
          createdAt: lastMessage.createdAt,
          author: lastMessage.author,
        }
      : null,
    updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
  };
  if (conversation.kind === 'direct') {
    const other = await ConversationMember.findOne({
      where: { conversationId: conversation.id, userId: { [Op.ne]: viewer.id } },
      include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'lastSeenAt'] }],
    });
    const person = other?.user?.toJSON() ?? null;
    return { ...base, title: person?.name ?? 'Someone', subtitle: person?.title ?? person?.email ?? '', person: person && { ...person, isOnline: isUserOnline(person.id) }, otherLastReadAt: other?.lastReadAt ?? null };
  }
  const memberCount = (people ?? (await participantIds(conversation))).length;
  if (conversation.kind === 'team') {
    return { ...base, title: team?.name ?? 'Team', subtitle: department ? `${department.name} · team` : 'Team', team: team && { id: team.id, name: team.name }, memberCount };
  }
  return { ...base, title: department?.name ?? 'Department', subtitle: 'Whole department', department: department && { id: department.id, name: department.name }, memberCount };
}

const hasFeature = (viewer, key) => entitlementsFor(viewer.organization).features[key];

/** Every conversation this person can open, most recent first; each kind only when the plan includes it. */
export async function listConversations(viewer) {
  const entries = [
    ...(hasFeature(viewer, 'teamChat') ? await groupConversations(viewer) : []),
    ...(hasFeature(viewer, 'directMessages') ? await directConversations(viewer) : []),
  ];
  const summaries = await Promise.all(entries.map((entry) => summarize(viewer, entry)));
  return summaries.filter((summary) => summary.kind !== 'direct' || summary.person).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/** Opens (or starts) the private chat with another person in the organization. */
export async function openDirect(viewer, otherUserId) {
  assertFeature(viewer.organization, 'directMessages');
  if (otherUserId === viewer.id) throw ApiError.badRequest('Choose someone else to message');
  const isMember = await OrganizationMember.count({ where: { organizationId: viewer.organization.id, userId: otherUserId, status: 'active' } });
  if (!isMember) throw ApiError.notFound('This person is not in your organization');

  const directKey = [viewer.id, otherUserId].sort().join(':');
  const [conversation] = await Conversation.findOrCreate({
    where: { organizationId: viewer.organization.id, directKey },
    defaults: { organizationId: viewer.organization.id, kind: 'direct', directKey },
  });
  for (const userId of [viewer.id, otherUserId]) await ConversationMember.findOrCreate({ where: { conversationId: conversation.id, userId } });
  return summarize(viewer, { conversation });
}

async function describe(viewer, conversation, people) {
  if (conversation.kind === 'direct') return summarize(viewer, { conversation }, people);
  if (conversation.kind === 'team') {
    const team = await Team.findByPk(conversation.teamId);
    const department = team ? await Department.findByPk(team.departmentId) : null;
    return summarize(viewer, { conversation, team, department }, people);
  }
  return summarize(viewer, { conversation, department: await Department.findByPk(conversation.departmentId) }, people);
}

/** The conversation with its latest messages, oldest first. */
export async function getConversation(viewer, conversationId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const membership = await ConversationMember.findOne({ where: { conversationId, userId: viewer.id } });
  const messages = await ConversationMessage.findAll({
    where: { conversationId, ...(await visibleTo(viewer, conversationId, membership)) },
    include: authorInclude,
    order: [['createdAt', 'DESC']],
    limit: THREAD_LIMIT,
  });
  return { conversation: await describe(viewer, conversation, people), messages: messages.reverse() };
}

async function markReadInternal(conversationId, userId, people) {
  const readAt = new Date();
  const [membership] = await ConversationMember.findOrCreate({ where: { conversationId, userId } });
  await membership.update({ lastReadAt: readAt });
  broadcast(people, 'conversation:read', { conversationId, userId, readAt });
  return readAt;
}

export async function sendMessage(viewer, conversationId, body) {
  const { people } = await loadConversation(viewer, conversationId);
  const created = await ConversationMessage.create({ conversationId, authorId: viewer.id, body });
  const message = (await ConversationMessage.findByPk(created.id, { include: authorInclude })).toJSON();
  broadcast(people, 'conversation:message', message);
  await markReadInternal(conversationId, viewer.id, people);
  return message;
}

export async function markRead(viewer, conversationId) {
  const { people } = await loadConversation(viewer, conversationId);
  return { readAt: await markReadInternal(conversationId, viewer.id, people) };
}

/** "Delete for everyone": only the author can; the bubble stays as "This message was deleted". */
export async function deleteMessage(viewer, conversationId, messageId) {
  const { people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId } });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.authorId !== viewer.id) throw ApiError.forbidden('You can only delete your own messages');
  if (!message.deletedAt) await message.update({ body: '', deletedAt: new Date() });
  const updated = (await ConversationMessage.findByPk(message.id, { include: authorInclude })).toJSON();
  broadcast(people, 'conversation:updated', updated);
  return updated;
}

/** Changes the text of your own message; everyone sees the new text, marked as edited. */
export async function editMessage(viewer, conversationId, messageId, body) {
  const { people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId } });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.authorId !== viewer.id) throw ApiError.forbidden('You can only edit your own messages');
  if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
  if (message.body !== body) await message.update({ body, editedAt: new Date() });
  const updated = (await ConversationMessage.findByPk(message.id, { include: authorInclude })).toJSON();
  broadcast(people, 'conversation:updated', updated);
  return updated;
}

/** "Delete for me": anyone can remove any message from their own view; everyone else still sees it. */
export async function hideMessage(viewer, conversationId, messageId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId }, attributes: ['id'] });
  if (!message) throw ApiError.notFound('Message not found');
  await ConversationHiddenMessage.findOrCreate({ where: { messageId, userId: viewer.id }, defaults: { conversationId } });
  emitToUser(viewer.id, 'conversation:hidden', { conversationId, messageId });
  return describe(viewer, conversation, people);
}

/** "Clear chat": empties the conversation for this person only; everyone else keeps every message. */
export async function clearConversation(viewer, conversationId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const clearedAt = new Date();
  const [membership] = await ConversationMember.findOrCreate({ where: { conversationId, userId: viewer.id } });
  await membership.update({ clearedAt, lastReadAt: clearedAt });
  emitToUser(viewer.id, 'conversation:cleared', { conversationId, clearedAt });
  return describe(viewer, conversation, people);
}
