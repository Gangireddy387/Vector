import { loadIssueWithAccess } from '../projects/project-access.js';
import * as commentService from './comment.service.js';

export const list = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  res.json({ comments: await commentService.listComments(issue.id) });
};

export const create = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  res.status(201).json({ comment: await commentService.createComment(issue, req.user, req.body.body) });
};

export const update = async (req, res) =>
  res.json({ comment: await commentService.updateComment(req.params.commentId, req.user.id, req.body.body) });

export const remove = async (req, res) => {
  await commentService.deleteComment(req.params.commentId, req.user.id);
  res.status(204).end();
};
