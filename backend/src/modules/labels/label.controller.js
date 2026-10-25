import * as labelService from './label.service.js';

export const list = async (req, res) => res.json({ labels: await labelService.listLabels(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ label: await labelService.createLabel(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({ label: await labelService.updateLabel(req.params.projectId, req.params.labelId, req.body) });

export const remove = async (req, res) => {
  await labelService.deleteLabel(req.params.projectId, req.params.labelId);
  res.status(204).end();
};
