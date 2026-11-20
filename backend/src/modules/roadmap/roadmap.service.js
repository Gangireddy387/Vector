import { ApiError } from '../../shared/errors/api-error.js';
import { Project } from '../../database/models.js';
import { getIssueDetail, listIssues, updateIssue } from '../issues/issue.service.js';
import { listSprints } from '../sprints/sprint.service.js';

/** Project roadmap payload: issues for the Gantt tree plus sprint bands when scrum. */
export async function getRoadmap(projectId, userId) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'type'] });
  if (!project) throw ApiError.notFound('Project not found');

  const [{ issues }, sprints] = await Promise.all([
    listIssues(userId, { projectId, limit: 1000, offset: 0, sort: 'position', order: 'asc' }),
    project.type === 'scrum' ? listSprints(projectId) : Promise.resolve([]),
  ]);

  return {
    projectId,
    projectType: project.type,
    issues,
    sprints: sprints.filter((sprint) => sprint.state !== 'completed' || Boolean(sprint.startDate && sprint.endDate)),
  };
}

/**
 * Reschedule an issue on the roadmap (dates and optional lane fields).
 * Delegates to issue update so activity + sockets stay consistent.
 */
export async function rescheduleIssue(projectId, issueId, changes, actor) {
  const detail = await getIssueDetail(issueId, actor.id);
  if (detail.projectId !== projectId) {
    throw ApiError.badRequest('That task is not in this project');
  }

  const startDate = 'startDate' in changes ? changes.startDate : detail.startDate;
  const dueDate = 'dueDate' in changes ? changes.dueDate : detail.dueDate;
  if (startDate && dueDate && startDate > dueDate) {
    throw ApiError.badRequest('Start date must be on or before the due date');
  }

  await updateIssue(detail.id, changes, actor, { source: 'roadmap' });
  return getIssueDetail(detail.id, actor.id);
}
