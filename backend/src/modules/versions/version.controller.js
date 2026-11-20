import * as versionService from './version.service.js';

export const list = async (req, res) => res.json(await versionService.listVersions(req.params.projectId, req.filters ?? {}));

export const get = async (req, res) => res.json(await versionService.getVersion(req.params.projectId, req.params.versionId));

export const create = async (req, res) =>
  res.status(201).json({ version: await versionService.createVersion(req.params.projectId, req.body) });

export const update = async (req, res) =>
  res.json({ version: await versionService.updateVersion(req.params.projectId, req.params.versionId, req.body) });

export const release = async (req, res) =>
  res.json(await versionService.releaseVersion(req.params.projectId, req.params.versionId));

export const archive = async (req, res) =>
  res.json({ version: await versionService.archiveVersion(req.params.projectId, req.params.versionId) });

export const reopen = async (req, res) =>
  res.json({ version: await versionService.reopenVersion(req.params.projectId, req.params.versionId) });

export const generateNotes = async (req, res) =>
  res.json(await versionService.generateReleaseNotes(req.params.projectId, req.params.versionId, req.body));

export const remove = async (req, res) => {
  await versionService.deleteVersion(req.params.projectId, req.params.versionId);
  res.status(204).end();
};
