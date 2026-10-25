import * as standupService from './standup.service.js';

export const day = async (req, res) => res.json(await standupService.getStandupDay(req.params.projectId, req.filters.date));

export const save = async (req, res) => res.json({ update: await standupService.saveStandup(req.params.projectId, req.user, req.body) });

export const remove = async (req, res) => {
  await standupService.deleteStandup(req.params.projectId, req.user.id, req.filters.date);
  res.status(204).end();
};

export const draft = async (req, res) => res.json(await standupService.draftStandup(req.params.projectId, req.user, req.body.date));
