import * as automationService from './automation.service.js';

export const list = async (req, res) => res.json({ rules: await automationService.listRules(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ rule: await automationService.createRule(req.params.projectId, req.body, req.user) });

export const update = async (req, res) =>
  res.json({ rule: await automationService.updateRule(req.params.projectId, req.params.ruleId, req.body) });

export const remove = async (req, res) => {
  await automationService.deleteRule(req.params.projectId, req.params.ruleId);
  res.status(204).end();
};
