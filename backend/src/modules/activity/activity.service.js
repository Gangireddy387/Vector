import { Activity, Issue, Project, User } from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const toText = (value) => (value === undefined || value === null ? null : String(value));

export function logActivity({ projectId, issueId = null, actorId = null, action, field = null, fromValue, toValue, meta = null }) {
  return Activity.create({
    projectId,
    issueId,
    actorId,
    action,
    field,
    fromValue: toText(fromValue),
    toValue: toText(toValue),
    meta,
  });
}

const activityInclude = [
  { model: User, as: 'actor', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: Issue, as: 'issue', attributes: ['id', 'key', 'title', 'type'] },
  { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
];

export const listIssueActivity = (issueId) =>
  Activity.findAll({ where: { issueId }, include: activityInclude.slice(0, 1), order: [['createdAt', 'DESC']], limit: 200 });

export const listProjectsActivity = (projectIds, limit = 30) =>
  Activity.findAll({ where: { projectId: projectIds }, include: activityInclude, order: [['createdAt', 'DESC']], limit });
