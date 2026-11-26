import { Router } from 'express';
import { z } from 'zod';
import { requireOrgPermission } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/middleware/validate.js';
import { requireFeature } from '../../plans/plan.service.js';
import * as service from './gitlab-webhook.service.js';

const feature = requireFeature('vcsLinks');
const manage = requireOrgPermission('workspace.manage');

/** Authenticated admin routes for enabling GitLab inbound sync. */
export const gitlabAdminRoutes = Router();

gitlabAdminRoutes.get('/workspace/integrations/gitlab', manage, feature, async (req, res) => {
  res.json(await service.getGitlabIntegration(req.organization));
});

gitlabAdminRoutes.put(
  '/workspace/integrations/gitlab',
  manage,
  feature,
  validate({
    body: z
      .object({
        enabled: z.boolean().optional(),
        mergeClosesIssue: z.boolean().optional(),
      })
      .refine((body) => body.enabled !== undefined || body.mergeClosesIssue !== undefined, {
        message: 'Provide enabled and/or mergeClosesIssue',
      }),
  }),
  async (req, res) => {
    const { enabled, mergeClosesIssue } = req.body;
    if (enabled === true) {
      return res.json(await service.enableGitlabIntegration(req.organization, { mergeClosesIssue }));
    }
    if (enabled === false) {
      return res.json(await service.disableGitlabIntegration(req.organization));
    }
    res.json(await service.updateGitlabIntegrationSettings(req.organization, { mergeClosesIssue }));
  },
);

gitlabAdminRoutes.post('/workspace/integrations/gitlab/regenerate-secret', manage, feature, async (req, res) => {
  res.json(await service.regenerateGitlabSecret(req.organization));
});

/**
 * GitLab webhook — mounted in app.js *before* express.json so the body stays raw for token checks.
 */
export function mountGitlabWebhook(app) {
  app.post('/api/integrations/gitlab/webhook/:orgSlug', async (req, res, next) => {
    try {
      const orgSlug = String(req.params.orgSlug || '');
      if (!/^[a-z0-9-]{1,40}$/i.test(orgSlug)) {
        return res.status(400).json({ message: 'Invalid organization slug' });
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      const result = await service.handleGitlabWebhook({
        orgSlug,
        rawBody,
        token: req.headers['x-gitlab-token'],
        event: req.headers['x-gitlab-event'],
        deliveryId: req.headers['x-gitlab-event-uuid'] || req.headers['x-request-id'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
