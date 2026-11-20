import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as service from './intake.service.js';

const router = Router();
const feature = requireFeature('intakeForms');
const projectParams = z.object({ projectId: z.string().uuid() });
const issueTypes = ISSUE_TYPES.filter((type) => type !== 'epic' && type !== 'subtask');

const updateSchema = z.object({
  enabled: z.boolean(),
  reset: z.boolean().optional(),
  title: z.string().trim().min(2).max(120).optional(),
  intro: z.string().trim().max(2000).nullable().optional(),
  issueType: z.enum(issueTypes).optional(),
  defaultPriority: z.enum(ISSUE_PRIORITIES).optional(),
  settings: z
    .object({
      askDescription: z.boolean().optional(),
      askPriority: z.boolean().optional(),
    })
    .optional(),
});

router.get(
  '/projects/:projectId/intake-form',
  feature,
  validate({ params: projectParams }),
  requireProjectRole('admin'),
  async (req, res) => res.json({ intake: await service.getProjectIntake(req.user.id, req.params.projectId) }),
);

router.post(
  '/projects/:projectId/intake-form',
  feature,
  validate({ params: projectParams, body: updateSchema }),
  requireProjectRole('admin'),
  async (req, res) => res.json({ intake: await service.setProjectIntake(req.user.id, req.params.projectId, req.body) }),
);

export default router;
