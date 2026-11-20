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
const submissionParams = z.object({ projectId: z.string().uuid(), submissionId: z.string().uuid() });
const issueParams = z.object({ issueId: z.string().min(1).max(40) });
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
      requireApproval: z.boolean().optional(),
      reviewStatusId: z.union([z.string().uuid(), z.null()]).optional(),
    })
    .optional(),
});

const listQuery = z.object({
  state: z.enum(['pending', 'approved', 'rejected', 'all']).optional(),
});

const decideSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  statusId: z.string().uuid().optional(),
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

router.get(
  '/projects/:projectId/intake-submissions',
  feature,
  validate({ params: projectParams, query: listQuery }),
  requireProjectRole('admin'),
  async (req, res) =>
    res.json({
      submissions: await service.listIntakeSubmissions(req.user.id, req.params.projectId, {
        state: req.filters?.state ?? 'pending',
      }),
    }),
);

router.post(
  '/projects/:projectId/intake-submissions/:submissionId/approve',
  feature,
  validate({ params: submissionParams, body: decideSchema }),
  requireProjectRole('admin'),
  async (req, res) =>
    res.json({
      submission: await service.approveIntakeSubmission(req.user.id, req.params.projectId, req.params.submissionId, req.body),
    }),
);

router.post(
  '/projects/:projectId/intake-submissions/:submissionId/reject',
  feature,
  validate({ params: submissionParams, body: decideSchema }),
  requireProjectRole('admin'),
  async (req, res) =>
    res.json({
      submission: await service.rejectIntakeSubmission(req.user.id, req.params.projectId, req.params.submissionId, req.body),
    }),
);

router.get(
  '/issues/:issueId/intake-submission',
  feature,
  validate({ params: issueParams }),
  async (req, res) => res.json({ submission: await service.getIssueIntakeSubmission(req.user.id, req.params.issueId) }),
);

export default router;
