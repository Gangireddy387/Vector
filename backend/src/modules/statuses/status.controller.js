import * as statusService from './status.service.js';

export const list = async (req, res) => res.json({ statuses: await statusService.listStatuses(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ status: await statusService.createStatus(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({ status: await statusService.updateStatus(req.params.projectId, req.params.statusId, req.body) });

export const reorder = async (req, res) =>
  res.json({ statuses: await statusService.reorderStatuses(req.params.projectId, req.body.statusIds) });

export const remove = async (req, res) => {
  await statusService.deleteStatus(req.params.projectId, req.params.statusId, req.filters.moveIssuesTo);
  res.status(204).end();
};
