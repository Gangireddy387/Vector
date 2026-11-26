import * as componentService from './component.service.js';

export const list = async (req, res) => res.json({ components: await componentService.listComponents(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ component: await componentService.createComponent(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({ component: await componentService.updateComponent(req.params.projectId, req.params.componentId, req.body) });

export const remove = async (req, res) => {
  await componentService.deleteComponent(req.params.projectId, req.params.componentId);
  res.status(204).end();
};
