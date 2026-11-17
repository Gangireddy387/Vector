import { Router } from 'express';
import { requireOrganizationAdmin } from '../../shared/middleware/authenticate.js';
import * as billing from './billing.service.js';

/** Mounted after global authenticate. */
export const billingRoutes = Router();
billingRoutes.get('/billing/status', (_req, res) => res.json(billing.billingStatus()));
billingRoutes.post('/billing/checkout', requireOrganizationAdmin, async (req, res) => {
  res.json(await billing.createProCheckout(req.organization, req.user));
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
