import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as controller from './custom-field.controller.js';
import {
  createCustomFieldSchema,
  reorderCustomFieldsSchema,
  updateCustomFieldSchema,
} from './custom-field.validation.js';

const router = Router();
const base = '/projects/:projectId/custom-fields';

// Definitions are readable on any plan (values stay visible if the plan drops the feature).
router.get(base, requireProjectRole(), controller.list);
router.post(
  base,
  requireFeature('customFields'),
  requireProjectRole('admin'),
  validate({ body: createCustomFieldSchema }),
  controller.create,
);
router.patch(
  `${base}/:fieldId`,
  requireFeature('customFields'),
  requireProjectRole('admin'),
  validate({ body: updateCustomFieldSchema }),
  controller.update,
);
router.put(
  `${base}/order`,
  requireFeature('customFields'),
  requireProjectRole('admin'),
  validate({ body: reorderCustomFieldsSchema }),
  controller.reorder,
);
router.delete(`${base}/:fieldId`, requireFeature('customFields'), requireProjectRole('admin'), controller.remove);

export default router;
