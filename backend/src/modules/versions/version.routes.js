import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './version.controller.js';
import {
  createVersionSchema,
  generateNotesSchema,
  listVersionsQuery,
  updateVersionSchema,
} from './version.validation.js';

const router = Router();
const feature = requireFeature('releases');
const base = '/projects/:projectId/versions';

router.get(base, feature, requireProjectRole(), validate({ query: listVersionsQuery }), controller.list);
router.post(base, feature, requireProjectRole('member'), validate({ body: createVersionSchema }), controller.create);
router.get(`${base}/:versionId`, feature, requireProjectRole(), controller.get);
router.patch(
  `${base}/:versionId`,
  feature,
  requireProjectRole('member'),
  validate({ body: updateVersionSchema }),
  controller.update,
);
router.post(`${base}/:versionId/release`, feature, requireProjectRole('member'), controller.release);
router.post(`${base}/:versionId/archive`, feature, requireProjectRole('member'), controller.archive);
router.post(`${base}/:versionId/reopen`, feature, requireProjectRole('member'), controller.reopen);
router.post(
  `${base}/:versionId/release-notes`,
  feature,
  requireProjectRole('member'),
  validate({ body: generateNotesSchema }),
  controller.generateNotes,
);
router.delete(`${base}/:versionId`, feature, requireProjectRole('admin'), controller.remove);

export default router;
