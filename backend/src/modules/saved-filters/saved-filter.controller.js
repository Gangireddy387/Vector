import * as savedFilterService from './saved-filter.service.js';

export const list = async (req, res) =>
  res.json({ filters: await savedFilterService.listSavedFilters(req.user.id, req.query.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ filter: await savedFilterService.createSavedFilter(req.user.id, req.body) });

export const update = async (req, res) =>
  res.json({ filter: await savedFilterService.updateSavedFilter(req.user.id, req.params.filterId, req.body) });

export const remove = async (req, res) => {
  await savedFilterService.deleteSavedFilter(req.user.id, req.params.filterId);
  res.status(204).end();
};
