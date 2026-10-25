import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { OrganizationMember, ProjectMember, User } from '../../database/models.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { USER_SUMMARY_ATTRIBUTES } from './user.model.js';
import { assertProjectRole } from '../projects/project-access.js';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

export const pickAvatarColor = (seed) => {
  const hash = [...String(seed)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

/** Lists people in the current organization (or in one project of it). */
export async function searchUsers(currentUserId, { q, projectId }) {
  let userIds;
  if (projectId) {
    await assertProjectRole(projectId, currentUserId);
    const memberships = await ProjectMember.findAll({ where: { projectId }, attributes: ['userId'], raw: true });
    userIds = [...new Set([currentUserId, ...memberships.map((membership) => membership.userId)])];
  } else {
    const organizationId = currentOrganizationId();
    const members = organizationId
      ? await OrganizationMember.findAll({ where: { organizationId, status: 'active' }, attributes: ['userId'], raw: true })
      : [];
    userIds = [...new Set([currentUserId, ...members.map((member) => member.userId)])];
  }

  const where = { id: userIds };
  if (q) {
    const term = `%${q}%`;
    where[Op.or] = [{ name: { [likeOperator]: term } }, { email: { [likeOperator]: term } }];
  }
  return User.findAll({ where, attributes: [...USER_SUMMARY_ATTRIBUTES, 'status'], order: [['name', 'ASC']], limit: 50 });
}
