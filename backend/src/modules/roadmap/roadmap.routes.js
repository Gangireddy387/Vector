import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as service from './roadmap.service.js';

const router = Router();
const feature = requireFeature('roadmap');
const base = '/projects/:projectId/roadmap';

const projectParams = z.object({ projectId: z.string().uuid() });
const issueParams = z.object({
  projectId: z.string().uuid(),
  issueId: z.string().uuid(),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format').nullable();

const rescheduleSchema = z
  .object({
    startDate: dateOnly.optional(),
    dueDate: dateOnly.optional(),
    sprintId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field to update' })
  .refine(
    (body) => !(body.startDate && body.dueDate && body.startDate > body.dueDate),
    { message: 'Start date must be on or before the due date' },
  );

router.get(base, feature, requireProjectRole(), validate({ params: projectParams }), async (req, res) => {
  res.json(await service.getRoadmap(req.params.projectId, req.user.id));
});

router.patch(
  `${base}/issues/:issueId`,
  feature,
  requireProjectRole('member'),
  validate({ params: issueParams, body: rescheduleSchema }),
  async (req, res) => {
    const issue = await service.rescheduleIssue(req.params.projectId, req.params.issueId, req.body, req.user);
    res.json({ issue });
  },
);

export default router;
