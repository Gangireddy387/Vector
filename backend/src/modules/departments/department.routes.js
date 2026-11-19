import { Router } from 'express';
import { requireOrgPermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as service from './department.service.js';
import {
  assignProjectSchema,
  createDepartmentSchema,
  createTeamSchema,
  departmentIdParams,
  teamIdParams,
  teamProjectParams,
  updateDepartmentSchema,
  updateTeamSchema,
} from './department.validation.js';

/**
 * Departments (with a head) and their teams (with a lead and members). Organization admins see and shape all of it;
 * everyone else sees only the departments and teams they belong to, read-only.
 */
const router = Router();
const admin = requireOrgPermission('workspace.structure');
const viewer = (req) => ({
  userId: req.user.id,
  isAdmin: req.organizationRole === 'admin' || (req.organizationPermissions ?? []).includes('workspace.structure'),
});

const respond = async (req, res, status = 200) => res.status(status).json({ departments: await service.listDepartments(req.organization.id, viewer(req)) });

router.get('/departments', (req, res) => respond(req, res));
router.get('/departments/:departmentId/projects', validate({ params: departmentIdParams }), async (req, res) =>
  res.json(await service.getDepartmentProjects(req.organization.id, req.params.departmentId, viewer(req))),
);
router.get('/teams/:teamId/work', validate({ params: teamIdParams }), async (req, res) =>
  res.json(await service.getTeamWork(req.organization.id, req.params.teamId, viewer(req))),
);

router.post('/departments', admin, validate({ body: createDepartmentSchema }), async (req, res) => {
  await service.createDepartment(req.organization.id, req.body);
  await respond(req, res, 201);
});
router.patch('/departments/:departmentId', admin, validate({ params: departmentIdParams, body: updateDepartmentSchema }), async (req, res) => {
  await service.updateDepartment(req.organization.id, req.params.departmentId, req.body);
  await respond(req, res);
});
router.delete('/departments/:departmentId', admin, validate({ params: departmentIdParams }), async (req, res) => {
  await service.deleteDepartment(req.organization.id, req.params.departmentId);
  await respond(req, res);
});

router.post('/departments/:departmentId/teams', admin, validate({ params: departmentIdParams, body: createTeamSchema }), async (req, res) => {
  await service.createTeam(req.organization.id, req.params.departmentId, req.body);
  await respond(req, res, 201);
});
router.patch('/teams/:teamId', admin, validate({ params: teamIdParams, body: updateTeamSchema }), async (req, res) => {
  await service.updateTeam(req.organization.id, req.params.teamId, req.body);
  await respond(req, res);
});
router.delete('/teams/:teamId', admin, validate({ params: teamIdParams }), async (req, res) => {
  await service.deleteTeam(req.organization.id, req.params.teamId);
  await respond(req, res);
});
router.post('/teams/:teamId/projects', admin, validate({ params: teamIdParams, body: assignProjectSchema }), async (req, res) => {
  await service.assignProject(req.organization.id, req.params.teamId, req.body.projectId);
  res.json(await service.getTeamWork(req.organization.id, req.params.teamId, viewer(req)));
});
router.delete('/teams/:teamId/projects/:projectId', admin, validate({ params: teamProjectParams }), async (req, res) => {
  await service.unassignProject(req.organization.id, req.params.teamId, req.params.projectId);
  res.json(await service.getTeamWork(req.organization.id, req.params.teamId, viewer(req)));
});

export default router;
