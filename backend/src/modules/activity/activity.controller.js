import { loadIssueWithAccess } from '../projects/project-access.js';
import { listIssueActivity, listProjectsActivity } from './activity.service.js';

export const listForProject = async (req, res) =>
  res.json({ activities: await listProjectsActivity([req.params.projectId], req.filters.limit) });

export const listForIssue = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  res.json({ activities: await listIssueActivity(issue.id) });
};
