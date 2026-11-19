import * as service from './goal.service.js';

export const list = async (req, res) => res.json({ goals: await service.listGoals(req.filters ?? {}) });

export const get = async (req, res) => res.json({ goal: await service.getGoal(req.params.goalId) });

export const create = async (req, res) => res.status(201).json({ goal: await service.createGoal(req.body, req.user) });

export const update = async (req, res) => res.json({ goal: await service.updateGoal(req.params.goalId, req.body, req.user) });

export const remove = async (req, res) => {
  await service.removeGoal(req.params.goalId);
  res.status(204).end();
};

export const createKeyResult = async (req, res) =>
  res.status(201).json({ goal: await service.createKeyResult(req.params.goalId, req.body) });

export const updateKeyResult = async (req, res) =>
  res.json({ goal: await service.updateKeyResult(req.params.goalId, req.params.keyResultId, req.body) });

export const removeKeyResult = async (req, res) =>
  res.json({ goal: await service.removeKeyResult(req.params.goalId, req.params.keyResultId) });

export const addLink = async (req, res) =>
  res.status(201).json({
    goal: await service.addKeyResultLink(req.params.goalId, req.params.keyResultId, req.body.issueId, req.user),
  });

export const removeLink = async (req, res) =>
  res.json({
    goal: await service.removeKeyResultLink(req.params.goalId, req.params.keyResultId, req.params.linkId),
  });

export const searchIssues = async (req, res) =>
  res.json({ issues: await service.searchLinkableIssues(req.query.q, Number(req.query.limit) || 20) });
