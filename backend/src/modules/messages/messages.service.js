import { Op } from 'sequelize';
import {
  Channel,
  ChannelMember,
  Conversation,
  ConversationFile,
  ConversationHiddenMessage,
  ConversationMember,
  ConversationMessage,
  ConversationMessageRevision,
  ConversationReaction,
  ConversationSavedMessage,
  Department,
  OrganizationMember,
  Team,
  TeamMember,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser, isUserOnline } from '../../shared/realtime/socket.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';
import { extractMentionIds } from '../comments/comment.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { NOTIFY_LEVELS, REACTION_EMOJIS } from './conversation.model.js';
import { assertFeature, entitlementsFor } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { participantIds } from './membership.js';

const THREAD_LIMIT = 300;
/** Group chats load their latest posts, each with all of its replies. */
const POST_LIMIT = 100;
const authorInclude = [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }];
/** Which plan switch a kind of conversation needs. */
const FEATURE_FOR = { direct: 'directMessages', team: 'teamChat', department: 'teamChat', channel: 'teamChat' };

/*
 * Every function takes the `viewer`: { id, organization (loaded with its plan), isAdmin }.
 * Organization admins can open every team and department chat and every standard channel; private channels and
 * direct chats are only ever visible to their people.
 */

/** Renaming, deleting and choosing who is in a channel: its creator, the team lead, the department head and admins. */
export const canManageChannel = (viewer, channel, team, department) =>
  Boolean(viewer.isAdmin || channel.createdById === viewer.id || team?.leadId === viewer.id || department?.headId === viewer.id);

/** The conversation and everyone in it, when this person may open it (files and typing use it too). */
export async function loadConversation(viewer, conversationId) {
  const conversation = await Conversation.findOne({ where: { id: conversationId, organizationId: viewer.organization.id } });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  assertFeature(viewer.organization, FEATURE_FOR[conversation.kind]);
  const people = await participantIds(conversation);
  if (!people.includes(viewer.id)) throw ApiError.notFound('Conversation not found');
  return { conversation, people };
}

/** `@[everyone](…)`: mentions everyone in a team chat or channel (Teams' @channel). */
export const EVERYONE_ID = '00000000-0000-0000-0000-000000000000';

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

  // One query for the chats that exist; only missing ones are created (a team or department chat starts on first use).
  const existing = teams.length || departments.length
    ? await Conversation.findAll({ where: { [Op.or]: [{ teamId: teams.map((team) => team.id) }, { departmentId: departments.map((department) => department.id) }] } })
    : [];
  const byTeam = new Map(existing.filter((item) => item.teamId).map((item) => [item.teamId, item]));
  const byDepartment = new Map(existing.filter((item) => item.departmentId).map((item) => [item.departmentId, item]));
  const ensure = async (map, key, where, defaults) => map.get(key) ?? (await Conversation.findOrCreate({ where, defaults }))[0];

  const conversations = [];
  for (const team of teams) {
    const conversation = await ensure(byTeam, team.id, { teamId: team.id }, { organizationId, kind: 'team', teamId: team.id });
    conversations.push({ conversation, team, department: departments.find((department) => department.id === team.departmentId) ?? null });
  }
  conversations.push(...(await channelConversations(viewer, teams, departments)));
  for (const department of departments) {
    const conversation = await ensure(byDepartment, department.id, { departmentId: department.id }, { organizationId, kind: 'department', departmentId: department.id });
    conversations.push({ conversation, department });
  }
  return conversations;
}

/** The channels of these teams this person can open: every standard one, and the private ones they were added to. */
async function channelConversations(viewer, teams, departments) {
  if (!teams.length) return [];
  const channels = await Channel.findAll({ where: { teamId: teams.map((team) => team.id) }, order: [['name', 'ASC']] });
  const privateIds = channels.filter((channel) => channel.privacy === 'private').map((channel) => channel.id);
  const joined = privateIds.length
    ? new Set((await ChannelMember.findAll({ where: { channelId: privateIds, userId: viewer.id }, attributes: ['channelId'], raw: true })).map((row) => row.channelId))
    : new Set();
  const visible = channels.filter((channel) => channel.privacy !== 'private' || joined.has(channel.id));
  if (!visible.length) return [];
  const existing = new Map((await Conversation.findAll({ where: { channelId: visible.map((channel) => channel.id) } })).map((item) => [item.channelId, item]));
  const entries = [];
  for (const channel of visible) {
    const conversation =
      existing.get(channel.id) ??
      (await Conversation.findOrCreate({ where: { channelId: channel.id }, defaults: { organizationId: channel.organizationId, kind: 'channel', channelId: channel.id } }))[0];
    const team = teams.find((item) => item.id === channel.teamId);
    entries.push({ conversation, channel, team, department: departments.find((department) => department.id === team?.departmentId) ?? null });
  }
  return entries;
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
async function visibleTo(viewer, conversationId, membership, hiddenIds = null) {
  const hidden =
    hiddenIds ?? (await ConversationHiddenMessage.findAll({ where: { conversationId, userId: viewer.id }, attributes: ['messageId'], raw: true })).map((row) => row.messageId);
  return {
    ...(membership?.clearedAt ? { createdAt: { [Op.gt]: membership.clearedAt } } : {}),
    ...(hidden.length ? { id: { [Op.notIn]: hidden } } : {}),
  };
}

/**
 * What the list needs about this person in many conversations at once (their membership, the messages they deleted
 * for themselves, and the other person of direct chats): three queries in total instead of three per conversation.
 */
async function prefetchFor(viewer, conversationIds) {
  if (!conversationIds.length) return { memberships: new Map(), hidden: new Map(), others: new Map() };
  const [memberships, hiddenRows, others] = await Promise.all([
    ConversationMember.findAll({ where: { conversationId: conversationIds, userId: viewer.id } }),
    ConversationHiddenMessage.findAll({ where: { conversationId: conversationIds, userId: viewer.id }, attributes: ['conversationId', 'messageId'], raw: true }),
    ConversationMember.findAll({
      where: { conversationId: conversationIds, userId: { [Op.ne]: viewer.id } },
      include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'lastSeenAt'] }],
    }),
  ]);
  const hidden = new Map();
  for (const row of hiddenRows) hidden.set(row.conversationId, [...(hidden.get(row.conversationId) ?? []), row.messageId]);
  return {
    memberships: new Map(memberships.map((membership) => [membership.conversationId, membership])),
    hidden,
    others: new Map(others.map((member) => [member.conversationId, member])),
  };
}

async function summarize(viewer, { conversation, team = null, department = null, channel = null }, people = null, prefetched = null) {
  const membership = prefetched ? prefetched.memberships.get(conversation.id) : await ConversationMember.findOne({ where: { conversationId: conversation.id, userId: viewer.id } });
  const visible = await visibleTo(viewer, conversation.id, membership, prefetched ? (prefetched.hidden.get(conversation.id) ?? []) : null);
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

  const notifyLevel = levelOf(membership);
  const base = {
    id: conversation.id,
    kind: conversation.kind,
    unread,
    notifyLevel,
    /** True when alerts are not "all" (mentions-only or off). Kept for older clients. */
    muted: notifyLevel !== 'all',
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          body: lastMessage.deletedAt ? '' : preview(lastMessage.subject ? `${lastMessage.subject}: ${lastMessage.body}` : lastMessage.body),
          deleted: Boolean(lastMessage.deletedAt),
          createdAt: lastMessage.createdAt,
          author: lastMessage.author,
        }
      : null,
    updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
  };
  if (conversation.kind === 'direct') {
    const other = prefetched
      ? prefetched.others.get(conversation.id)
      : await ConversationMember.findOne({
          where: { conversationId: conversation.id, userId: { [Op.ne]: viewer.id } },
          include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'lastSeenAt'] }],
        });
    const person = other?.user?.toJSON() ?? null;
    return { ...base, title: person?.name ?? 'Someone', subtitle: person?.title ?? person?.email ?? '', person: person && { ...person, isOnline: isUserOnline(person.id) }, otherLastReadAt: other?.lastReadAt ?? null };
  }
  const memberCount = (people ?? (await participantIds(conversation))).length;
  if (conversation.kind === 'channel') {
    return {
      ...base,
      title: channel?.name ?? 'Channel',
      subtitle: `${team?.name ?? 'Team'} · ${channel?.privacy === 'private' ? 'private channel' : 'channel'}`,
      team: team && { id: team.id, name: team.name },
      channel: channel && {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        privacy: channel.privacy,
        createdById: channel.createdById,
        canManage: canManageChannel(viewer, channel, team, department),
      },
      memberCount,
    };
  }
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
  const prefetched = await prefetchFor(viewer, entries.map((entry) => entry.conversation.id));
  const summaries = await Promise.all(entries.map((entry) => summarize(viewer, entry, null, prefetched)));
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
  if (conversation.kind === 'channel') {
    const channel = await Channel.findByPk(conversation.channelId);
    const team = channel ? await Team.findByPk(channel.teamId) : null;
    const department = team ? await Department.findByPk(team.departmentId) : null;
    return summarize(viewer, { conversation, channel, team, department }, people);
  }
  if (conversation.kind === 'team') {
    const team = await Team.findByPk(conversation.teamId);
    const department = team ? await Department.findByPk(team.departmentId) : null;
    return summarize(viewer, { conversation, team, department }, people);
  }
  return summarize(viewer, { conversation, department: await Department.findByPk(conversation.departmentId) }, people);
}

/** The list entry for one conversation this person can open. */
export async function conversationSummary(viewer, conversationId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  return describe(viewer, conversation, people);
}

/**
 * The conversation with its latest messages, oldest first. Group chats are posts with replies (like Teams): their
 * latest posts come with every reply, so a thread is never cut in half.
 */
export async function getConversation(viewer, conversationId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const membership = await ConversationMember.findOne({ where: { conversationId, userId: viewer.id } });
  const visible = await visibleTo(viewer, conversationId, membership);
  let messages;
  if (conversation.kind === 'direct') {
    messages = (await ConversationMessage.findAll({ where: { conversationId, ...visible }, include: authorInclude, order: [['createdAt', 'DESC']], limit: THREAD_LIMIT })).reverse();
  } else {
    const posts = (
      await ConversationMessage.findAll({ where: { conversationId, parentId: null, ...visible }, include: authorInclude, order: [['createdAt', 'DESC']], limit: POST_LIMIT })
    ).reverse();
    // Pinned posts stay reachable even when they are older than the latest posts.
    const loaded = new Set(posts.map((post) => post.id));
    const pinned = (
      await ConversationMessage.findAll({ where: { conversationId, parentId: null, pinnedAt: { [Op.ne]: null }, ...visible }, include: authorInclude, order: [['createdAt', 'ASC']] })
    ).filter((post) => !loaded.has(post.id));
    const threadPosts = [...pinned, ...posts];
    const replies = threadPosts.length
      ? await ConversationMessage.findAll({ where: { conversationId, parentId: threadPosts.map((post) => post.id), ...visible }, include: authorInclude, order: [['createdAt', 'ASC']] })
      : [];
    messages = [...threadPosts, ...replies];
  }
  const savedIds = messages.length
    ? (await ConversationSavedMessage.findAll({ where: { userId: viewer.id, messageId: messages.map((message) => message.id) }, attributes: ['messageId'], raw: true })).map(
        (row) => row.messageId,
      )
    : [];
  return { conversation: await describe(viewer, conversation, people), messages: await decorate(messages, viewer.id), savedIds };
}

/** Everyone who can read the conversation (for @mentions and calls). */
export async function listPeople(viewer, conversationId) {
  const { people } = await loadConversation(viewer, conversationId);
  return User.findAll({ where: { id: people }, attributes: USER_SUMMARY_ATTRIBUTES, order: [['name', 'ASC']] });
}

/** Each message's reactions, one entry per emoji (in the picker's order) with who reacted. */
async function reactionsFor(messageIds) {
  const byMessage = new Map();
  if (!messageIds.length) return byMessage;
  const rows = await ConversationReaction.findAll({ where: { messageId: messageIds }, attributes: ['messageId', 'userId', 'emoji'], order: [['createdAt', 'ASC']], raw: true });
  for (const row of rows) {
    const emojis = byMessage.get(row.messageId) ?? new Map();
    emojis.set(row.emoji, [...(emojis.get(row.emoji) ?? []), row.userId]);
    byMessage.set(row.messageId, emojis);
  }
  const order = (emoji) => (REACTION_EMOJIS.includes(emoji) ? REACTION_EMOJIS.indexOf(emoji) : REACTION_EMOJIS.length);
  return new Map(
    [...byMessage].map(([messageId, emojis]) => [messageId, [...emojis].map(([emoji, userIds]) => ({ emoji, userIds })).sort((a, b) => order(a.emoji) - order(b.emoji))]),
  );
}

export const fileView = (file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, size: file.size });

/** Messages as the app shows them: with their reactions, files, and poll/approval cards. */
async function decorate(messages, viewerId = null) {
  const plainMessages = messages.map((message) => (message.toJSON ? message.toJSON() : message));
  const ids = plainMessages.map((message) => message.id);
  const [reactions, files] = await Promise.all([
    reactionsFor(ids),
    ids.length ? ConversationFile.findAll({ where: { messageId: ids }, order: [['createdAt', 'ASC']] }) : [],
  ]);
  const filesOf = new Map();
  for (const file of files) filesOf.set(file.messageId, [...(filesOf.get(file.messageId) ?? []), fileView(file)]);
  const withFiles = plainMessages.map((message) => ({ ...message, reactions: reactions.get(message.id) ?? [], files: filesOf.get(message.id) ?? [] }));
  const { attachCollab } = await import('./conversation-collab.service.js');
  return attachCollab(withFiles, viewerId);
}

const loadMessage = async (messageId, viewerId = null) =>
  (await decorate([await ConversationMessage.findByPk(messageId, { include: authorInclude })], viewerId))[0];

/** Public reload used by polls/approvals after a vote or response. */
export const reloadMessage = loadMessage;

async function markReadInternal(conversationId, userId, people) {
  const readAt = new Date();
  const [membership] = await ConversationMember.findOrCreate({ where: { conversationId, userId } });
  await membership.update({ lastReadAt: readAt });
  broadcast(people, 'conversation:read', { conversationId, userId, readAt });
  return readAt;
}

const MAX_PINNED = 20;
const isGroup = (conversation) => conversation.kind !== 'direct';
const preview = (body) => body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi, '@$1').replace(/\s+/g, ' ').trim().slice(0, 240);
async function placeName(viewer, conversation, people) {
  const summary = await describe(viewer, conversation, people);
  return conversation.kind === 'team' ? `${summary.title} · General` : summary.title;
}

/**
 * `parentId`: a reply to that post. `subject` and `important`: a headline and an "Important" mark for a post. All
 * three only in group chats (team chats, departments and channels). `fileIds`: files this person uploaded to the
 * conversation, shared with the message (a message can be only files).
 */
export async function sendMessage(viewer, conversationId, { body = '', parentId = null, subject = null, important = false, fileIds = [] }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  let parent = null;
  if ((parentId || subject || important) && !isGroup(conversation)) throw ApiError.badRequest('Replies, subjects and important posts are for team chats and channels');
  if (!body && !fileIds.length) throw ApiError.badRequest('Write a message');
  if (parentId) {
    parent = await ConversationMessage.findOne({ where: { id: parentId, conversationId }, attributes: ['id', 'parentId', 'authorId', 'deletedAt'] });
    if (!parent || parent.parentId) throw ApiError.badRequest('Reply to a post in this conversation');
    if (parent.deletedAt) throw ApiError.badRequest('This post was deleted');
  }
  const files = fileIds.length ? await ConversationFile.findAll({ where: { id: fileIds, conversationId, uploaderId: viewer.id, messageId: null } }) : [];
  if (files.length !== new Set(fileIds).size) throw ApiError.badRequest('A file could not be attached. Upload it again.');
  const created = await ConversationMessage.create({
    conversationId,
    authorId: viewer.id,
    body,
    parentId: parent?.id ?? null,
    subject: parent ? null : subject || null,
    important: Boolean(important && !parent),
  });
  if (files.length) await ConversationFile.update({ messageId: created.id }, { where: { id: files.map((file) => file.id) } });
  const message = await loadMessage(created.id, viewer.id);
  broadcast(people, 'conversation:message', message);
  await markReadInternal(conversationId, viewer.id, people);
  if (isGroup(conversation)) {
    const mentioned = await notifyMentions(viewer, conversation, message, people);
    if (parent) await notifyThread(viewer, conversation, parent, message, people, mentioned);
  } else {
    // Direct chats: nudge people who are not looking at Vector right now.
    const recipients = people.filter((userId) => userId !== viewer.id && !isUserOnline(userId));
    const alertable = await filterByNotifyLevel(conversation.id, recipients, { allowMentions: false });
    if (alertable.length) {
      await notifyUsers({
        userIds: alertable,
        actorId: viewer.id,
        type: 'direct_message',
        title: viewer.name ?? 'New message',
        body: preview(message.body) || 'Sent an attachment',
        link: `/messages/${conversation.id}`,
        email: false,
      });
    }
  }
  return message;
}

/** `all` | `mentions` | `none`. Older muted rows that still have the default level count as mentions-only. */
function levelOf(membership) {
  if (!membership) return 'all';
  const level = NOTIFY_LEVELS.includes(membership.notifyLevel) ? membership.notifyLevel : null;
  if (level && level !== 'all') return level;
  if (membership.mutedAt) return 'mentions';
  return 'all';
}

/**
 * Drops people whose notify preference blocks this kind of alert.
 * `allowMentions`: mention alerts go to `all` and `mentions`; thread replies only to `all`.
 */
async function filterByNotifyLevel(conversationId, userIds, { allowMentions }) {
  if (!userIds.length) return [];
  const rows = await ConversationMember.findAll({
    where: { conversationId, userId: { [Op.in]: userIds } },
    attributes: ['userId', 'notifyLevel', 'mutedAt'],
  });
  const byUser = new Map(rows.map((row) => [row.userId, levelOf(row)]));
  return userIds.filter((userId) => {
    const level = byUser.get(userId) ?? 'all';
    if (level === 'none') return false;
    if (level === 'mentions') return allowMentions;
    return true;
  });
}

/** @mentioned people in the conversation hear about it (`skip`: people already mentioned before an edit). */
async function notifyMentions(viewer, conversation, message, people, skip = new Set()) {
  const audience = new Set(people);
  const mentionedIds = extractMentionIds(message.body);
  const everyone = mentionedIds.includes(EVERYONE_ID) && !skip.has(EVERYONE_ID);
  const candidates = (everyone ? people : mentionedIds).filter((userId) => userId !== viewer.id && audience.has(userId) && !skip.has(userId));
  const userIds = await filterByNotifyLevel(conversation.id, candidates, { allowMentions: true });
  if (!userIds.length) return new Set();
  const place = await placeName(viewer, conversation, people);
  await notifyUsers({
    userIds,
    actorId: viewer.id,
    type: 'chat_mention',
    title: everyone ? `${viewer.name ?? 'Someone'} mentioned everyone in ${place}` : `${viewer.name ?? 'Someone'} mentioned you in ${place}`,
    body: preview(message.body),
    link: `/messages/${conversation.id}?post=${message.parentId ?? message.id}`,
    email: false,
  });
  return new Set(userIds);
}

/** A reply tells the post's author and everyone who already replied to it, like a Teams thread. */
async function notifyThread(viewer, conversation, parent, message, people, mentioned) {
  const repliers = (await ConversationMessage.findAll({ where: { parentId: parent.id }, attributes: ['authorId'], raw: true })).map((row) => row.authorId);
  const audience = new Set(people);
  const candidates = [parent.authorId, ...repliers].filter((userId) => userId && userId !== viewer.id && audience.has(userId) && !mentioned.has(userId));
  const userIds = await filterByNotifyLevel(conversation.id, candidates, { allowMentions: false });
  if (!userIds.length) return;
  await notifyUsers({
    userIds,
    actorId: viewer.id,
    type: 'channel_reply',
    title: `${viewer.name ?? 'Someone'} replied in ${await placeName(viewer, conversation, people)}`,
    body: preview(message.body),
    link: `/messages/${conversation.id}?post=${parent.id}`,
    email: false,
  });
}

/** Pins a post to the top of a group chat (or unpins it); anyone in the conversation can. */
export async function pinMessage(viewer, conversationId, messageId, pinned) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (!isGroup(conversation)) throw ApiError.badRequest('Posts are pinned in team chats and channels');
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId } });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.parentId) throw ApiError.badRequest('Pin the post, not a reply');
  if (pinned && message.deletedAt) throw ApiError.badRequest('This post was deleted');
  if (pinned && !message.pinnedAt) {
    const count = await ConversationMessage.count({ where: { conversationId, pinnedAt: { [Op.ne]: null } } });
    if (count >= MAX_PINNED) throw ApiError.badRequest(`Up to ${MAX_PINNED} posts can be pinned. Unpin one first.`);
  }
  if (Boolean(message.pinnedAt) !== pinned) await message.update(pinned ? { pinnedAt: new Date(), pinnedById: viewer.id } : { pinnedAt: null, pinnedById: null });
  const updated = await loadMessage(message.id);
  broadcast(people, 'conversation:updated', updated);
  return updated;
}

/** Adds this person's reaction, or takes it back when they already reacted with that emoji. */
export async function toggleReaction(viewer, conversationId, messageId, emoji) {
  const { people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId }, attributes: ['id', 'deletedAt'] });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
  const existing = await ConversationReaction.findOne({ where: { messageId, userId: viewer.id, emoji } });
  if (existing) await existing.destroy();
  else await ConversationReaction.findOrCreate({ where: { messageId, userId: viewer.id, emoji }, defaults: { conversationId } });
  const reactions = (await reactionsFor([messageId])).get(messageId) ?? [];
  broadcast(people, 'conversation:reactions', { conversationId, messageId, reactions });
  return { messageId, reactions };
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
  if (!message.deletedAt) {
    await message.update({ body: '', subject: null, important: false, deletedAt: new Date(), pinnedAt: null, pinnedById: null });
    await ConversationReaction.destroy({ where: { messageId: message.id } });
    await deleteFilesWhere({ messageId: message.id });
    const { destroyCollabForMessage } = await import('./conversation-collab.service.js');
    await destroyCollabForMessage(message.id);
  }
  const updated = await loadMessage(message.id, viewer.id);
  broadcast(people, 'conversation:updated', updated);
  return updated;
}

/**
 * Changes the text (and, for posts, the subject) of your own message; everyone sees it marked as edited. People
 * newly @mentioned in the edit hear about it.
 */
export async function editMessage(viewer, conversationId, messageId, { body, subject }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId } });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.authorId !== viewer.id) throw ApiError.forbidden('You can only edit your own messages');
  if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
  const nextSubject = subject === undefined || message.parentId || !isGroup(conversation) ? message.subject : subject || null;
  const alreadyMentioned = new Set(extractMentionIds(message.body));
  if (message.body !== body || message.subject !== nextSubject) {
    await ConversationMessageRevision.create({
      messageId: message.id,
      conversationId,
      editorId: viewer.id,
      body: message.body,
      subject: message.subject,
    });
    await message.update({ body, subject: nextSubject, editedAt: new Date() });
  }
  const updated = await loadMessage(message.id);
  broadcast(people, 'conversation:updated', updated);
  if (isGroup(conversation)) await notifyMentions(viewer, conversation, updated, people, alreadyMentioned);
  return updated;
}

/** Prior versions of a message, newest first (after the author edited it). */
export async function listMessageHistory(viewer, conversationId, messageId) {
  await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId }, attributes: ['id', 'deletedAt'] });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
  const revisions = await ConversationMessageRevision.findAll({
    where: { messageId },
    include: [{ model: User, as: 'editor', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  return revisions.map((row) => ({
    id: row.id,
    body: row.body,
    subject: row.subject,
    createdAt: row.createdAt,
    editor: row.editor,
  }));
}

/**
 * Posts a copy of a message into another conversation this person can open, with attribution
 * (Teams "Forward"). Optional `note` is appended after the quote.
 */
export async function forwardMessage(viewer, conversationId, messageId, { targetConversationId, note = '' }) {
  if (targetConversationId === conversationId) throw ApiError.badRequest('Pick a different chat to forward to');
  const { conversation: source, people: sourcePeople } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({
    where: { id: messageId, conversationId },
    include: authorInclude,
  });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
  await loadConversation(viewer, targetConversationId);
  const place = await placeName(viewer, source, sourcePeople);
  const authorName = message.author?.name ?? 'Someone';
  const quotedBody = (message.body || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  const subjectLine = message.subject ? `> **${message.subject}**\n` : '';
  const header = `**Forwarded from ${authorName} in ${place}**`;
  const extra = typeof note === 'string' ? note.trim() : '';
  const body = [header, `${subjectLine}${quotedBody}`.trim(), extra].filter(Boolean).join('\n\n').slice(0, 4000);
  if (!body.trim()) throw ApiError.badRequest('Nothing to forward');
  return sendMessage(viewer, targetConversationId, { body });
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

/** Removes stored files (and their rows), e.g. of a deleted message or channel. */
export async function deleteFilesWhere(where) {
  const files = await ConversationFile.findAll({ where, attributes: ['id', 'storageKey'] });
  if (!files.length) return;
  await Promise.all(files.map((file) => deleteStoredFile(file.storageKey)));
  await ConversationFile.destroy({ where: { id: files.map((file) => file.id) } });
}

/** The Files tab: everything shared in the conversation, newest first, with who shared it and in which post. */
export async function listFiles(viewer, conversationId) {
  await loadConversation(viewer, conversationId);
  const files = await ConversationFile.findAll({
    where: { conversationId, messageId: { [Op.ne]: null } },
    include: [
      { model: User, as: 'uploader', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: ConversationMessage, as: 'message', attributes: ['id', 'parentId'], required: true, where: { deletedAt: null } },
    ],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
  return files.map((file) => ({ ...fileView(file), createdAt: file.createdAt, uploader: file.uploader, messageId: file.message.id, postId: file.message.parentId ?? file.message.id }));
}

/** "Save this message": private bookmarks; returns whether it is saved now. */
export async function setSaved(viewer, conversationId, messageId, saved) {
  await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId }, attributes: ['id', 'deletedAt'] });
  if (!message) throw ApiError.notFound('Message not found');
  if (saved) {
    if (message.deletedAt) throw ApiError.badRequest('This message was deleted');
    await ConversationSavedMessage.findOrCreate({ where: { userId: viewer.id, messageId }, defaults: { conversationId } });
  } else {
    await ConversationSavedMessage.destroy({ where: { userId: viewer.id, messageId } });
  }
  emitToUser(viewer.id, 'conversation:saved', { conversationId, messageId, saved });
  return { messageId, saved };
}

/** Everything this person saved that they can still open, newest saves first, with where it was said. */
export async function listSaved(viewer) {
  const rows = await ConversationSavedMessage.findAll({
    where: { userId: viewer.id },
    include: [{ model: ConversationMessage, as: 'message', required: true, where: { deletedAt: null }, include: authorInclude }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  const places = new Map();
  const items = [];
  for (const row of rows) {
    if (!places.has(row.conversationId)) {
      places.set(
        row.conversationId,
        await loadConversation(viewer, row.conversationId)
          .then(async ({ conversation, people }) => {
            const summary = await describe(viewer, conversation, people);
            return { id: conversation.id, kind: conversation.kind, title: conversation.kind === 'team' ? 'General' : summary.title, team: summary.team ?? null };
          })
          .catch(() => null),
      );
    }
    const place = places.get(row.conversationId);
    if (place) items.push({ savedAt: row.createdAt, conversation: place, message: (await decorate([row.message]))[0] });
  }
  return items;
}

/** "Mark as unread": the conversation counts as unread again from this message on. */
export async function markUnread(viewer, conversationId, messageId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const message = await ConversationMessage.findOne({ where: { id: messageId, conversationId }, attributes: ['createdAt'] });
  if (!message) throw ApiError.notFound('Message not found');
  const [membership] = await ConversationMember.findOrCreate({ where: { conversationId, userId: viewer.id } });
  await membership.update({ lastReadAt: new Date(new Date(message.createdAt).getTime() - 1) });
  const summary = await describe(viewer, conversation, people);
  emitToUser(viewer.id, 'conversation:summary', summary);
  return summary;
}

/**
 * Sets how this person is alerted for the conversation: `all`, `mentions`, or `none`.
 * `muted: true/false` still works for older clients (`true` → mentions, `false` → all).
 */
export async function setNotifyLevel(viewer, conversationId, { notifyLevel, muted } = {}) {
  let level = notifyLevel;
  if (level == null && typeof muted === 'boolean') level = muted ? 'mentions' : 'all';
  if (!NOTIFY_LEVELS.includes(level)) throw ApiError.badRequest('Choose all, mentions, or none');
  const { conversation, people } = await loadConversation(viewer, conversationId);
  const [membership] = await ConversationMember.findOrCreate({
    where: { conversationId, userId: viewer.id },
    defaults: { notifyLevel: 'all' },
  });
  await membership.update({
    notifyLevel: level,
    mutedAt: level === 'all' ? null : membership.mutedAt || new Date(),
  });
  const summary = await describe(viewer, conversation, people);
  emitToUser(viewer.id, 'conversation:summary', summary);
  return summary;
}

/** @deprecated Prefer setNotifyLevel; kept so older mute toggles keep working. */
export async function setMuted(viewer, conversationId, muted) {
  return setNotifyLevel(viewer, conversationId, { muted: Boolean(muted) });
}
