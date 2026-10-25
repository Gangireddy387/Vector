import * as sprintService from './sprint.service.js';

export const list = async (req, res) => res.json({ sprints: await sprintService.listSprints(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ sprint: await sprintService.createSprint(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({ sprint: await sprintService.updateSprint(req.params.projectId, req.params.sprintId, req.body) });

export const start = async (req, res) =>
  res.json({ sprint: await sprintService.startSprint(req.params.projectId, req.params.sprintId, req.body, req.user) });

export const complete = async (req, res) =>
  res.json({ sprint: await sprintService.completeSprint(req.params.projectId, req.params.sprintId, req.body, req.user) });

export const remove = async (req, res) => {
  await sprintService.deleteSprint(req.params.projectId, req.params.sprintId);
  res.status(204).end();
};
