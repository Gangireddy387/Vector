import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { Issue, Project, Status, User } from '../../database/models.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { searchUsers } from '../users/user.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

export async function globalSearch(userId, { q, limit }) {
  const projectIds = await getMemberProjectIds(userId);
  const term = `%${q}%`;

  const [issues, projects, people] = await Promise.all([
    Issue.findAll({
      where: { projectId: projectIds, [Op.or]: [{ title: { [likeOperator]: term } }, { key: { [likeOperator]: term } }] },
      attributes: ['id', 'key', 'title', 'type', 'priority', 'projectId'],
      include: [
        { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
        { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
        { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
    }),
    Project.findAll({
      where: { id: projectIds, [Op.or]: [{ name: { [likeOperator]: term } }, { key: { [likeOperator]: term } }] },
      attributes: ['id', 'key', 'name', 'color', 'type'],
      limit: 5,
    }),
    searchUsers(userId, { q }),
  ]);

  return { issues, projects, people: people.slice(0, 5) };
}
