import { ORG_PERMISSIONS } from './organization-role.constants.js';
import * as roleService from './organization-role.service.js';

export const catalog = async (_req, res) => res.json({ permissions: ORG_PERMISSIONS });

export const list = async (req, res) =>
  res.json({ roles: await roleService.listOrganizationRoles(req.organization.id) });

export const create = async (req, res) =>
  res.status(201).json({ role: await roleService.createOrganizationRole(req.organization.id, req.body) });

export const update = async (req, res) =>
  res.json({ role: await roleService.updateOrganizationRole(req.organization.id, req.params.roleId, req.body) });

export const remove = async (req, res) => {
  await roleService.deleteOrganizationRole(req.organization.id, req.params.roleId);
  res.status(204).end();
};
