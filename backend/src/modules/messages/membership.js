import { Channel, ChannelMember, ConversationMember, Department, OrganizationMember, Team, TeamMember } from '../../database/models.js';

const unique = (ids) => [...new Set(ids.filter(Boolean))];

export const adminIdsOf = async (organizationId) =>
  (await OrganizationMember.findAll({ where: { organizationId, role: 'admin', status: 'active' }, attributes: ['userId'], raw: true })).map((row) => row.userId);

/** The team's members, its lead and the head of its department. */
export async function teamPeople(team) {
  const members = (await TeamMember.findAll({ where: { teamId: team.id }, attributes: ['userId'], raw: true })).map((row) => row.userId);
  const department = await Department.findByPk(team.departmentId, { attributes: ['headId'], raw: true });
  return unique([...members, team.leadId, department?.headId]);
}

export async function departmentPeople(department) {
  const teams = await Team.findAll({ where: { departmentId: department.id }, attributes: ['id', 'leadId'], raw: true });
  const members = teams.length ? (await TeamMember.findAll({ where: { teamId: teams.map((team) => team.id) }, attributes: ['userId'], raw: true })).map((row) => row.userId) : [];
  return unique([...members, ...teams.map((team) => team.leadId), department.headId]);
}

/** Everyone who can open the team's channels: its people plus the organization's admins. */
export async function teamAudience(team) {
  return unique([...(await teamPeople(team)), ...(await adminIdsOf(team.organizationId))]);
}

/**
 * Standard channels: the whole team (as its General chat). Private channels: the people added to them, as long as
 * they still belong to the team (someone who leaves the team leaves its private channels too).
 */
export async function channelPeople(channel) {
  const team = await Team.findByPk(channel.teamId);
  if (!team) return [];
  const audience = await teamAudience(team);
  if (channel.privacy !== 'private') return audience;
  const allowed = new Set(audience);
  const members = (await ChannelMember.findAll({ where: { channelId: channel.id }, attributes: ['userId'], raw: true })).map((row) => row.userId);
  return members.filter((userId) => allowed.has(userId));
}

/** Everyone who can read a conversation right now (group chats follow team, department and channel membership). */
export async function participantIds(conversation) {
  if (conversation.kind === 'direct') {
    return (await ConversationMember.findAll({ where: { conversationId: conversation.id }, attributes: ['userId'], raw: true })).map((row) => row.userId);
  }
  if (conversation.kind === 'channel') {
    const channel = await Channel.findByPk(conversation.channelId);
    return channel ? channelPeople(channel) : [];
  }
  const admins = await adminIdsOf(conversation.organizationId);
  if (conversation.kind === 'team') {
    const team = await Team.findByPk(conversation.teamId);
    return team ? unique([...(await teamPeople(team)), ...admins]) : [];
  }
  const department = await Department.findByPk(conversation.departmentId);
  return department ? unique([...(await departmentPeople(department)), ...admins]) : [];
}
