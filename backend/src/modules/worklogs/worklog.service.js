import { User, WorkLog } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logActivity } from '../activity/activity.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const userInclude = [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }];

export const listWorkLogs = (issueId) =>
  WorkLog.findAll({ where: { issueId }, include: userInclude, order: [['loggedAt', 'DESC']] });

export async function createWorkLog(issue, user, input) {
  const workLog = await WorkLog.create({ ...input, issueId: issue.id, userId: user.id, loggedAt: input.loggedAt ?? new Date() });
  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: user.id,
    action: 'logged_work',
    toValue: `${input.minutes}m`,
  });
  return WorkLog.findByPk(workLog.id, { include: userInclude });
}

export async function deleteWorkLog(workLogId, userId) {
  const workLog = await WorkLog.findByPk(workLogId, { include: ['issue'] });
  if (!workLog) throw ApiError.notFound('Work log not found');
  const membership = await assertProjectRole(workLog.issue.projectId, userId, 'member');
  if (workLog.userId !== userId && membership.role !== 'admin') throw ApiError.forbidden('You can only delete your own work logs');
  await workLog.destroy();
}
