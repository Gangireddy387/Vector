import * as projectService from './project.service.js';

export const list = async (req, res) => res.json({ projects: await projectService.listProjects(req.user.id, req.filters) });
export const create = async (req, res) => res.status(201).json({ project: await projectService.createProject(req.user, req.body) });
export const show = async (req, res) => res.json({ project: await projectService.getProject(req.params.projectId, req.user.id) });

export const update = async (req, res) =>
  res.json({ project: await projectService.updateProject(req.params.projectId, req.user, req.body) });

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
