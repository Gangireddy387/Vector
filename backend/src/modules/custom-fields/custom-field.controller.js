import * as customFieldService from './custom-field.service.js';

export const list = async (req, res) =>
  res.json({ customFields: await customFieldService.listCustomFields(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ customField: await customFieldService.createCustomField(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({
    customField: await customFieldService.updateCustomField(req.params.projectId, req.params.fieldId, req.body),
  });

export const reorder = async (req, res) =>
  res.json({ customFields: await customFieldService.reorderCustomFields(req.params.projectId, req.body.fieldIds) });

export const remove = async (req, res) => {
  await customFieldService.deleteCustomField(req.params.projectId, req.params.fieldId);
  res.status(204).end();
};
