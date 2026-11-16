import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './project.controller.js';
import { requireProjectRole } from './project-access.js';
import {
  addMemberSchema,
  createProjectSchema,
  listProjectsQuery,
  updateMemberSchema,
  updateProjectSchema,
} from './project.validation.js';

const router = Router();

router.get('/projects', validate({ query: listProjectsQuery }), controller.list);
router.post('/projects', validate({ body: createProjectSchema }), controller.create);
/** A ready-made project with a running sprint and example work, for exploring Vector. */
router.post('/projects/sample', controller.createSample);
router.get('/projects/:projectId', requireProjectRole(), controller.show);
router.patch('/projects/:projectId', requireProjectRole('admin'), validate({ body: updateProjectSchema }), controller.update);
/** Keep demo work as a real project, or wipe the sample entirely. */
router.post('/projects/:projectId/convert-sample', requireProjectRole('admin'), controller.convertSample);
router.delete('/projects/:projectId', requireProjectRole('admin'), controller.remove);

router.post('/projects/:projectId/members', requireProjectRole('admin'), validate({ body: addMemberSchema }), controller.addMember);
router.patch('/projects/:projectId/members/:userId', requireProjectRole('admin'), validate({ body: updateMemberSchema }), controller.updateMember);
router.delete('/projects/:projectId/members/:userId', requireProjectRole('admin'), controller.removeMember);

export default router;
