import { assertProjectRole, loadIssueWithAccess } from '../projects/project-access.js';
import * as issueService from './issue.service.js';

const respondWithDetail = async (res, issueId, userId, status = 200) =>
  res.status(status).json({ issue: await issueService.getIssueDetail(issueId, userId) });

export const list = async (req, res) => res.json(await issueService.listIssues(req.user.id, req.filters));
export const myWork = async (req, res) => res.json({ issues: await issueService.listMyWork(req.user.id) });
export const show = async (req, res) => respondWithDetail(res, req.params.issueId, req.user.id);

export const create = async (req, res) => {
  await assertProjectRole(req.body.projectId, req.user.id, 'member');
  const issue = await issueService.createIssue(req.body, req.user);
  return respondWithDetail(res, issue.id, req.user.id, 201);
};

export const update = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  await issueService.updateIssue(issue.id, req.body, req.user);
  return respondWithDetail(res, issue.id, req.user.id);
};

export const move = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  await issueService.updateIssue(issue.id, req.body, req.user);
  res.status(204).end();
};

export const remove = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  await issueService.deleteIssue(issue.id, req.user);
  res.status(204).end();
};

export const bulkUpdate = async (req, res) =>
  res.json(await issueService.bulkUpdate(req.body.issueIds, req.body.changes, req.user));

export const bulkDelete = async (req, res) => res.json(await issueService.bulkDelete(req.body.issueIds, req.user));

export const watch = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  await issueService.setWatching(issue.id, req.user.id, true);
  res.status(204).end();
};

export const unwatch = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  await issueService.setWatching(issue.id, req.user.id, false);
  res.status(204).end();
};

export const createLink = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  await issueService.createLink(issue, req.body, req.user);
  return respondWithDetail(res, issue.id, req.user.id, 201);
};

export const deleteLink = async (req, res) => {
  await issueService.deleteLink(req.params.linkId, req.user);
  res.status(204).end();
};
