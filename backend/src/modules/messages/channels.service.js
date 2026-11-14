import {
  Channel,
  ChannelMember,
  Conversation,
  ConversationHiddenMessage,
  ConversationMember,
  ConversationMessage,
  ConversationReaction,
  ConversationSavedMessage,
  Department,
  Team,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { assertFeature } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { canManageChannel, conversationSummary, deleteFilesWhere } from './messages.service.js';
import { channelPeople, teamAudience } from './membership.js';

/*
 * Channels inside a team, like Microsoft Teams. Anyone who can open the team's General chat can add a channel; its
 * creator, the team lead, the department head and organization admins can rename it, delete it and (private
 * channels) choose who is in it. Every function takes the same `viewer` as messages.service.js.
 */

const RESERVED_NAMES = new Set(['general']);
const tellLists = (userIds) => [...new Set(userIds)].forEach((userId) => emitToUser(userId, 'conversation:list', {}));

async function loadTeam(viewer, teamId) {
  const team = await Team.findOne({ where: { id: teamId, organizationId: viewer.organization.id } });
  if (!team) throw ApiError.notFound('Team not found');
  const audience = await teamAudience(team);
  if (!audience.includes(viewer.id)) throw ApiError.notFound('Team not found');
  return { team, audience };
}

async function loadChannel(viewer, channelId) {
  assertFeature(viewer.organization, 'teamChat');
  const channel = await Channel.findOne({ where: { id: channelId, organizationId: viewer.organization.id } });
  if (!channel) throw ApiError.notFound('Channel not found');
  const people = await channelPeople(channel);
  if (!people.includes(viewer.id)) throw ApiError.notFound('Channel not found');
  const team = await Team.findByPk(channel.teamId);
  const department = team ? await Department.findByPk(team.departmentId) : null;
  return { channel, team, department, people };
}

async function loadManaged(viewer, channelId) {
  const loaded = await loadChannel(viewer, channelId);
  if (!canManageChannel(viewer, loaded.channel, loaded.team, loaded.department)) {
    throw ApiError.forbidden('Only the channel’s creator, the team lead, the department head or an admin can change this channel');
  }
  return loaded;
}

async function assertName(teamId, name, exceptId = null) {
  if (RESERVED_NAMES.has(name.toLowerCase())) throw ApiError.badRequest('Every team already has a General channel. Choose another name.');
  const taken = (await Channel.findAll({ where: { teamId }, attributes: ['id', 'name'], raw: true })).some(
    (channel) => channel.id !== exceptId && channel.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw ApiError.conflict(`This team already has a channel called “${name}”`);
}

const conversationOf = async (channel) =>
  (await Conversation.findOrCreate({ where: { channelId: channel.id }, defaults: { organizationId: channel.organizationId, kind: 'channel', channelId: channel.id } }))[0];

/** `memberIds` (private channels): who else is in it, from the team; the creator always is. */
export async function createChannel(viewer, { teamId, name, description = null, privacy = 'standard', memberIds = [] }) {
  assertFeature(viewer.organization, 'teamChat');
  const { team, audience } = await loadTeam(viewer, teamId);
  await assertName(team.id, name);
  const channel = await Channel.create({ organizationId: viewer.organization.id, teamId: team.id, name, description: description || null, privacy, createdById: viewer.id });
  if (privacy === 'private') {
    const allowed = new Set(audience);
    const members = [...new Set([viewer.id, ...memberIds])].filter((userId) => allowed.has(userId));
    await ChannelMember.bulkCreate(members.map((userId) => ({ channelId: channel.id, userId })));
  }
  const conversation = await conversationOf(channel);
  tellLists(await channelPeople(channel));
  return conversationSummary(viewer, conversation.id);
}

export async function updateChannel(viewer, channelId, { name, description }) {
  const { channel, people } = await loadManaged(viewer, channelId);
  if (name !== undefined && name !== channel.name) await assertName(channel.teamId, name, channel.id);
  await channel.update({ ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description: description || null } : {}) });
  tellLists(people);
  return conversationSummary(viewer, (await conversationOf(channel)).id);
}

/** Removes the channel and every message in it, for everyone. */
export async function deleteChannel(viewer, channelId) {
  const { channel, people } = await loadManaged(viewer, channelId);
  const conversation = await Conversation.findOne({ where: { channelId: channel.id } });
  if (conversation) {
    await deleteFilesWhere({ conversationId: conversation.id });
    await ConversationReaction.destroy({ where: { conversationId: conversation.id } });
    await ConversationSavedMessage.destroy({ where: { conversationId: conversation.id } });
    await ConversationHiddenMessage.destroy({ where: { conversationId: conversation.id } });
    await ConversationMessage.destroy({ where: { conversationId: conversation.id } });
    await ConversationMember.destroy({ where: { conversationId: conversation.id } });
    await conversation.destroy();
  }
  await ChannelMember.destroy({ where: { channelId: channel.id } });
  await channel.destroy();
  for (const userId of people) emitToUser(userId, 'conversation:removed', { conversationId: conversation?.id ?? null, channelId: channel.id });
}

/** Who is in the channel, and (for managers of a private channel) who else from the team could be added. */
export async function listMembers(viewer, channelId) {
  const { channel, team, department, people } = await loadChannel(viewer, channelId);
  const audience = team ? await teamAudience(team) : [];
  const canManage = canManageChannel(viewer, channel, team, department);
  const candidateIds = channel.privacy === 'private' && canManage ? audience.filter((userId) => !people.includes(userId)) : [];
  const users = await User.findAll({ where: { id: [...people, ...candidateIds] }, attributes: USER_SUMMARY_ATTRIBUTES, order: [['name', 'ASC']] });
  const inChannel = new Set(people);
  return {
    privacy: channel.privacy,
    canManage,
    members: users.filter((user) => inChannel.has(user.id)),
    candidates: users.filter((user) => !inChannel.has(user.id)),
  };
}

export async function addMembers(viewer, channelId, userIds) {
  const { channel, team, people } = await loadManaged(viewer, channelId);
  if (channel.privacy !== 'private') throw ApiError.badRequest('Everyone in the team is already in this channel');
  const allowed = new Set(team ? await teamAudience(team) : []);
  const added = [...new Set(userIds)].filter((userId) => allowed.has(userId) && !people.includes(userId));
  if (added.length) await ChannelMember.bulkCreate(added.map((userId) => ({ channelId: channel.id, userId })), { ignoreDuplicates: true });
  tellLists([...people, ...added]);
  return listMembers(viewer, channelId);
}

/** Managers remove people from a private channel; anyone can leave one themselves. */
export async function removeMember(viewer, channelId, userId) {
  const leaving = userId === viewer.id;
  const { channel, people } = leaving ? await loadChannel(viewer, channelId) : await loadManaged(viewer, channelId);
  if (channel.privacy !== 'private') throw ApiError.badRequest('Standard channels include the whole team');
  if (!people.includes(userId)) throw ApiError.notFound('This person is not in the channel');
  if (people.length === 1) throw ApiError.badRequest('The last person cannot leave. Delete the channel instead.');
  await ChannelMember.destroy({ where: { channelId: channel.id, userId } });
  const conversation = await conversationOf(channel);
  emitToUser(userId, 'conversation:removed', { conversationId: conversation.id, channelId: channel.id });
  tellLists(people.filter((id) => id !== userId));
  return leaving ? null : listMembers(viewer, channelId);
}
