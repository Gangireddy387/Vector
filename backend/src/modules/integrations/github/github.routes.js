import { Router } from 'express';
import { z } from 'zod';
import { requireOrgPermission } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/middleware/validate.js';
import { requireFeature } from '../../plans/plan.service.js';
import * as service from './github-webhook.service.js';

const feature = requireFeature('vcsLinks');
const manage = requireOrgPermission('workspace.manage');

/** Authenticated admin routes for enabling GitHub inbound sync. */
export const githubAdminRoutes = Router();

githubAdminRoutes.get('/workspace/integrations/github', manage, feature, async (req, res) => {
  res.json(await service.getGithubIntegration(req.organization));
});

githubAdminRoutes.put(
  '/workspace/integrations/github',
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
      return res.json(await service.enableGithubIntegration(req.organization, { mergeClosesIssue }));
    }
    if (enabled === false) {
      return res.json(await service.disableGithubIntegration(req.organization));
    }
    res.json(await service.updateGithubIntegrationSettings(req.organization, { mergeClosesIssue }));
  },
);

githubAdminRoutes.post('/workspace/integrations/github/regenerate-secret', manage, feature, async (req, res) => {
  res.json(await service.regenerateGithubSecret(req.organization));
});

/**
 * GitHub webhook — mounted in app.js *before* express.json so the body stays raw for signature checks.
 * Do not put this behind authenticate.
 */
export function mountGithubWebhook(app) {
  app.post('/api/integrations/github/webhook/:orgSlug', async (req, res, next) => {
    try {
      const orgSlug = String(req.params.orgSlug || '');
      if (!/^[a-z0-9-]{1,40}$/i.test(orgSlug)) {
        return res.status(400).json({ message: 'Invalid organization slug' });
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      const result = await service.handleGithubWebhook({
        orgSlug,
        rawBody,
        signature: req.headers['x-hub-signature-256'],
        event: req.headers['x-github-event'],
        deliveryId: req.headers['x-github-delivery'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
