import { Router } from 'express';
import { z } from 'zod';
import { requireOrganizationAdmin } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as service from './department.service.js';

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
const description = z.string().trim().max(300).nullable().optional();
const personId = z.string().uuid('Choose someone from the list').nullable().optional();

const departmentSchema = z.object({ name, description, headId: personId });
const teamSchema = z.object({ name, description, leadId: personId, memberIds: z.array(z.string().uuid()).max(500).optional() });
const atLeastOne = (schema) => schema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one change');

/** Organization admins shape the organization: departments (with a head) and their teams (with a lead and members). */
const router = Router();
router.use(['/departments', '/teams'], requireOrganizationAdmin);

const respond = async (req, res, status = 200) => res.status(status).json({ departments: await service.listDepartments(req.organization.id) });

router.get('/departments', (req, res) => respond(req, res));
router.post('/departments', validate({ body: departmentSchema }), async (req, res) => {
  await service.createDepartment(req.organization.id, req.body);
  await respond(req, res, 201);
});
router.patch('/departments/:departmentId', validate({ body: atLeastOne(departmentSchema) }), async (req, res) => {
  await service.updateDepartment(req.organization.id, req.params.departmentId, req.body);
  await respond(req, res);
});
router.delete('/departments/:departmentId', async (req, res) => {
  await service.deleteDepartment(req.organization.id, req.params.departmentId);
  await respond(req, res);
});

router.get('/departments/:departmentId/projects', async (req, res) =>
  res.json(await service.getDepartmentProjects(req.organization.id, req.params.departmentId)),
);
router.post('/departments/:departmentId/teams', validate({ body: teamSchema }), async (req, res) => {
  await service.createTeam(req.organization.id, req.params.departmentId, req.body);
  await respond(req, res, 201);
});
router.patch('/teams/:teamId', validate({ body: atLeastOne(teamSchema.extend({ departmentId: z.string().uuid() })) }), async (req, res) => {
  await service.updateTeam(req.organization.id, req.params.teamId, req.body);
  await respond(req, res);
});
// A team's projects and the tasks in them.
router.get('/teams/:teamId/work', async (req, res) => res.json(await service.getTeamWork(req.organization.id, req.params.teamId)));
router.post('/teams/:teamId/projects', validate({ body: z.object({ projectId: z.string().uuid('Choose a project') }) }), async (req, res) => {
  await service.assignProject(req.organization.id, req.params.teamId, req.body.projectId);
  res.json(await service.getTeamWork(req.organization.id, req.params.teamId));
});
router.delete('/teams/:teamId/projects/:projectId', async (req, res) => {
  await service.unassignProject(req.organization.id, req.params.teamId, req.params.projectId);
  res.json(await service.getTeamWork(req.organization.id, req.params.teamId));
});
router.delete('/teams/:teamId', async (req, res) => {
  await service.deleteTeam(req.organization.id, req.params.teamId);
  await respond(req, res);
});

export default router;
