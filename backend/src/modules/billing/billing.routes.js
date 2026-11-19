import { Router } from 'express';
import { z } from 'zod';
import { requireOrgPermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as billing from './billing.service.js';

const checkoutBody = z.object({
  seats: z.coerce.number().int().positive().optional(),
  plan: z.enum(['pro', 'enterprise']).optional(),
});

/** Mounted after global authenticate (organization resolved from X-Organization-Id when present). */
export const billingRoutes = Router();
billingRoutes.get('/billing/status', (req, res) => res.json(billing.billingStatus(req.organization)));
billingRoutes.post('/billing/checkout', requireOrgPermission('workspace.billing'), validate({ body: checkoutBody }), async (req, res) => {
  res.json(
    await billing.createCheckout(req.organization, req.user, {
      seats: req.body.seats,
      plan: req.body.plan ?? 'pro',
    }),
  );
});
billingRoutes.post(
  '/billing/seats',
  requireOrgPermission('workspace.billing'),
  validate({ body: z.object({ seats: z.coerce.number().int().positive() }) }),
  async (req, res) => {
    res.json(await billing.updateSubscriptionSeats(req.organization, req.body.seats));
  },
);
billingRoutes.post('/billing/portal', requireOrgPermission('workspace.billing'), async (req, res) => {
  res.json(await billing.createBillingPortal(req.organization));
});

/**
 * Stripe webhook — mounted in app.js *before* express.json so the body stays raw for signature checks.
 * Do not put this behind the global authenticate middleware.
 */
export function mountStripeWebhook(app) {
  app.post('/api/billing/stripe/webhook', async (req, res, next) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers['stripe-signature'];
      if (!signature) return res.status(400).json({ message: 'Missing Stripe-Signature' });
      res.json(await billing.handleStripeWebhook(rawBody, signature));
    } catch (error) {
      next(error);
    }
  });
}
