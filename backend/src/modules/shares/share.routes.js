import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireProjectRole } from '../projects/project-access.js';
import * as service from './share.service.js';

const router = Router();
const feature = requireFeature('publicShare');

const toggleSchema = z.object({
  enabled: z.boolean(),
  reset: z.boolean().optional(),
  /** Set a new password; empty string clears. Omit to leave unchanged. */
  password: z.union([z.string().min(4).max(72), z.literal('')]).optional(),
  /** ISO datetime or datetime-local string; null clears. */
  expiresAt: z.union([z.string().min(1).max(64), z.null()]).optional(),
  guestCommentsEnabled: z.boolean().optional(),
});

const projectParams = z.object({ projectId: z.string().uuid() });
const issueParams = z.object({ issueId: z.string().min(1).max(40) });

router.get(
  '/projects/:projectId/share-link',
  feature,
  validate({ params: projectParams }),
  requireProjectRole('admin'),
  async (req, res) => res.json({ share: await service.getBoardShare(req.user.id, req.params.projectId) }),
);

router.post(
  '/projects/:projectId/share-link',
  feature,
  validate({ params: projectParams, body: toggleSchema }),
  requireProjectRole('admin'),
  async (req, res) => res.json({ share: await service.setBoardShare(req.user.id, req.params.projectId, req.body) }),
);

router.get(
  '/issues/:issueId/share-link',
  feature,
  validate({ params: issueParams }),
  async (req, res) => res.json({ share: await service.getIssueShare(req.user.id, req.params.issueId) }),
);

router.post(
  '/issues/:issueId/share-link',
  feature,
  validate({ params: issueParams, body: toggleSchema }),
  async (req, res) => res.json({ share: await service.setIssueShare(req.user.id, req.params.issueId, req.body) }),
);

export default router;
