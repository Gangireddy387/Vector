import * as templateService from './template.service.js';

export const list = async (req, res) => res.json({ templates: await templateService.listTemplates(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ template: await templateService.createTemplate(req.params.projectId, req.body, req.user) });

export const update = async (req, res) =>
  res.json({ template: await templateService.updateTemplate(req.params.projectId, req.params.templateId, req.body) });

export const remove = async (req, res) => {
  await templateService.deleteTemplate(req.params.projectId, req.params.templateId);
  res.status(204).end();
};
