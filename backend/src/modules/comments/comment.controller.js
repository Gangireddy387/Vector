import { loadIssueWithAccess } from '../projects/project-access.js';
import * as commentService from './comment.service.js';

export const list = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  res.json({ comments: await commentService.listComments(issue.id) });
};

export const create = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'viewer');
  res.status(201).json({
    comment: await commentService.createComment(issue, req.user, req.body.body, {
      parentId: req.body.parentId ?? null,
    }),
  });
};

export const update = async (req, res) =>
  res.json({ comment: await commentService.updateComment(req.params.commentId, req.user.id, req.body.body) });

export const remove = async (req, res) => {
  await commentService.deleteComment(req.params.commentId, req.user.id);
  res.status(204).end();
};

export const react = async (req, res) =>
  res.json(await commentService.toggleReaction(req.user.id, req.params.commentId, req.body.emoji));
