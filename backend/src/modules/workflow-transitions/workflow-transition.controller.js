import * as transitionService from './workflow-transition.service.js';

export const list = async (req, res) =>
  res.json({ transitions: await transitionService.listTransitionRules(req.params.projectId) });

export const replace = async (req, res) =>
  res.json({ transitions: await transitionService.replaceTransitionRules(req.params.projectId, req.body.rules) });
