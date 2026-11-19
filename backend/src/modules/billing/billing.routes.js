import { Router } from 'express';
import { z } from 'zod';
import { requireOrganizationAdmin } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as billing from './billing.service.js';

const seatsBody = z.object({
  seats: z.coerce.number().int().positive().optional(),
});

/** Mounted after global authenticate (organization resolved from X-Organization-Id when present). */
export const billingRoutes = Router();
billingRoutes.get('/billing/status', (req, res) => res.json(billing.billingStatus(req.organization)));
billingRoutes.post('/billing/checkout', requireOrganizationAdmin, validate({ body: seatsBody }), async (req, res) => {
  res.json(await billing.createProCheckout(req.organization, req.user, { seats: req.body.seats }));
});
billingRoutes.post(
  '/billing/seats',
  requireOrganizationAdmin,
  validate({ body: z.object({ seats: z.coerce.number().int().positive() }) }),
  async (req, res) => {
    res.json(await billing.updateSubscriptionSeats(req.organization, req.body.seats));
  },
);
billingRoutes.post('/billing/portal', requireOrganizationAdmin, async (req, res) => {
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
