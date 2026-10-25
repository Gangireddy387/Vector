import { Op } from 'sequelize';
import { Issue, Project, ProjectMember, Status } from '../../database/models.js';

async function assignableMemberIds(projectId) {
  const members = await ProjectMember.findAll({
    where: { projectId, role: { [Op.in]: ['admin', 'member'] } },
    order: [['createdAt', 'ASC']],
    attributes: ['userId'],
    raw: true,
  });
  return members.map((member) => member.userId);
}

async function openWorkloadByUser(projectId, userIds) {
  const doneStatuses = await Status.findAll({ where: { projectId, category: 'done' }, attributes: ['id'], raw: true });
  const openIssues = await Issue.findAll({
    where: { projectId, assigneeId: userIds, statusId: { [Op.notIn]: doneStatuses.map((status) => status.id) } },
    attributes: ['assigneeId', 'storyPoints'],
    raw: true,
  });
  const load = new Map(userIds.map((id) => [id, 0]));
  openIssues.forEach((issue) => load.set(issue.assigneeId, load.get(issue.assigneeId) + (issue.storyPoints || 1)));
  return load;
}

/**
 * Chooses an assignee using one of the project's auto-assignment strategies.
 * Returns `null` when nobody suitable is available.
 */
export async function pickAssignee(projectOrId, strategy) {
  const project = typeof projectOrId === 'string' ? await Project.findByPk(projectOrId) : projectOrId;
  const settings = project.settings ?? {};
  const candidates = await assignableMemberIds(project.id);
  if (!candidates.length) return null;

  switch (strategy) {
    case 'project_lead':
      return candidates.includes(project.leadId) ? project.leadId : null;
    case 'default_assignee':
      return candidates.includes(settings.defaultAssigneeId) ? settings.defaultAssigneeId : null;
    case 'least_loaded': {
      const load = await openWorkloadByUser(project.id, candidates);
      return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
    }
    case 'round_robin': {
      const lastIndex = candidates.indexOf(settings.lastRoundRobinUserId);
      const next = candidates[(lastIndex + 1) % candidates.length];
      await project.update({ settings: { ...settings, lastRoundRobinUserId: next } });
      return next;
    }
    default:
      return null;
  }
}
