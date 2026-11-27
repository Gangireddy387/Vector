import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireOrgPermission } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as embed from './embed.service.js';
import { createEmbedAppSchema, embedConnectSchema } from './embed.validation.js';

const manage = requireOrgPermission('workspace.manage');
const feature = requireFeature('embedWorkspace');

/** Admin: manage embed keys (session auth). */
export const embedAdminRoutes = Router();

embedAdminRoutes.get('/workspace/embed/apps', manage, feature, async (req, res) => {
  res.json(await embed.listEmbedApps(req.organization.id));
});

embedAdminRoutes.post(
  '/workspace/embed/apps',
  manage,
  feature,
  validate({ body: createEmbedAppSchema }),
  async (req, res) => {
    res.status(201).json(await embed.createEmbedApp(req.organization, req.user, req.body));
  },
);

embedAdminRoutes.post(
  '/workspace/embed/apps/:appId/rotate-secret',
  manage,
  feature,
  validate({ params: z.object({ appId: z.string().uuid() }) }),
  async (req, res) => {
    res.json(await embed.rotateEmbedSecret(req.organization, req.user, req.params.appId));
  },
);

embedAdminRoutes.patch(
  '/workspace/embed/apps/:appId',
  manage,
  feature,
  validate({
    params: z.object({ appId: z.string().uuid() }),
    body: z.object({ enabled: z.boolean() }),
  }),
  async (req, res) => {
    res.json(await embed.setEmbedAppEnabled(req.organization, req.user, req.params.appId, req.body.enabled));
  },
);

embedAdminRoutes.delete(
  '/workspace/embed/apps/:appId',
  manage,
  feature,
  validate({ params: z.object({ appId: z.string().uuid() }) }),
  async (req, res) => {
    res.json(await embed.deleteEmbedApp(req.organization, req.user, req.params.appId));
  },
);

/**
 * Public partner APIs:
 * - POST /embed/connect — admin email + password + pk + sk → open workspace
 * - GET /embed/apps/:publishableKey — public metadata for the JS loader
 */
export const publicEmbedRoutes = Router();

publicEmbedRoutes.get(
  '/embed/apps/:publishableKey',
  validate({ params: z.object({ publishableKey: z.string().min(10).max(64) }) }),
  async (req, res) => {
    res.json(await embed.publicEmbedApp(req.params.publishableKey));
  },
);

publicEmbedRoutes.post('/embed/connect', validate({ body: embedConnectSchema }), async (req, res) => {
  res.json(await embed.connectEmbed(req.body));
});
