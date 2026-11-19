import { Router } from 'express';
import { z } from 'zod';
import { requireOrgPermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import { WEBHOOK_EVENTS } from './webhook.constants.js';
import * as webhookService from './webhook.service.js';

export const webhookAdminRoutes = Router();

const feature = requireFeature('webhooks');
const manage = requireOrgPermission('workspace.manage');

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  url: z.string().trim().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  enabled: z.boolean().optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    url: z.string().trim().url().max(2000).optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No changes' });

const idParams = z.object({ endpointId: z.string().uuid() });

webhookAdminRoutes.get('/workspace/webhooks', manage, feature, async (req, res) => {
  res.json(await webhookService.listEndpoints(req.organization.id));
});

webhookAdminRoutes.post(
  '/workspace/webhooks',
  manage,
  feature,
  validate({ body: createSchema }),
  async (req, res) => {
    res.status(201).json(await webhookService.createEndpoint(req.organization, req.user, req.body));
  },
);

webhookAdminRoutes.patch(
  '/workspace/webhooks/:endpointId',
  manage,
  feature,
  validate({ params: idParams, body: updateSchema }),
  async (req, res) => {
    res.json(await webhookService.updateEndpoint(req.organization, req.user, req.params.endpointId, req.body));
  },
);

webhookAdminRoutes.delete(
  '/workspace/webhooks/:endpointId',
  manage,
  feature,
  validate({ params: idParams }),
  async (req, res) => {
    res.json(await webhookService.deleteEndpoint(req.organization, req.user, req.params.endpointId));
  },
);

webhookAdminRoutes.post(
  '/workspace/webhooks/:endpointId/test',
  manage,
  feature,
  validate({ params: idParams }),
  async (req, res) => {
    res.json(await webhookService.sendTestDelivery(req.organization, req.params.endpointId));
  },
);
