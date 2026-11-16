import { convertSampleProject, createSampleProject } from './project.sample.js';
import * as projectService from './project.service.js';

export const list = async (req, res) => res.json({ projects: await projectService.listProjects(req.user.id, req.filters) });
export const create = async (req, res) => res.status(201).json({ project: await projectService.createProject(req.user, req.body) });
export const createSample = async (req, res) => res.status(201).json({ project: await createSampleProject(req.user) });
export const show = async (req, res) => res.json({ project: await projectService.getProject(req.params.projectId, req.user.id) });

export const update = async (req, res) =>
  res.json({ project: await projectService.updateProject(req.params.projectId, req.user, req.body) });

export const convertSample = async (req, res) => {
  const mode = req.body?.mode === 'wipe' ? 'wipe' : 'keep';
  const result = await convertSampleProject(req.params.projectId, req.user, { mode });
  if (result.wiped) return res.status(204).end();
  return res.json({ project: result.project });
};

export const remove = async (req, res) => {
  await projectService.deleteProject(req.params.projectId);
  res.status(204).end();
};

export const addMember = async (req, res) =>
  res.status(201).json({ member: await projectService.addMember(req.params.projectId, req.user, req.body) });

export const updateMember = async (req, res) =>
  res.json({ member: await projectService.updateMemberRole(req.params.projectId, req.params.userId, req.body.role) });

export const removeMember = async (req, res) => {
  await projectService.removeMember(req.params.projectId, req.params.userId, req.user);
  res.status(204).end();
};
