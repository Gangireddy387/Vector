import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { Organization, Plan } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { setOrganizationPlan } from '../plans/plan.service.js';
import { broadcastOrganization } from '../organizations/organization.service.js';

export const isCheckoutConfigured = () => Boolean(config.stripe.secretKey && config.stripe.webhookSecret && config.stripe.pricePro);

const stripe = () => {
  if (!config.stripe.secretKey) throw ApiError.badRequest('Card checkout is not configured on this server');
  return new Stripe(config.stripe.secretKey);
};

export function billingStatus() {
  return {
    checkoutEnabled: isCheckoutConfigured(),
    trialDays: isCheckoutConfigured() ? config.stripe.trialDays : 0,
  };
}

/** Starts Stripe Checkout for Pro; returns the hosted Checkout URL. */
export async function createProCheckout(organization, user) {
  if (!isCheckoutConfigured()) {
    throw new ApiError(503, 'Card checkout is not configured. Request an upgrade instead, or set STRIPE_* on the server.', {
      code: 'billing_not_configured',
    });
  }
  const plan = await Plan.findOne({ where: { name: 'Pro' } });
  if (!plan) throw ApiError.badRequest('Pro plan is not available');

  const client = stripe();
  let customerId = organization.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      email: user.email,
      name: organization.name,
      metadata: { organizationId: organization.id },
    });
    customerId = customer.id;
    await organization.update({ stripeCustomerId: customerId });
  }

  const trialDays = config.stripe.trialDays;
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: organization.id,
    line_items: [{ price: config.stripe.pricePro, quantity: 1 }],
    success_url: appUrl('/workspace-admin?tab=plan&billing=success'),
    cancel_url: appUrl('/workspace-admin?tab=plan&billing=cancel'),
    metadata: { organizationId: organization.id, planId: plan.id, userId: user.id },
    subscription_data: {
      metadata: { organizationId: organization.id, planId: plan.id },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
  });
  if (!session.url) throw ApiError.badRequest('Stripe did not return a checkout URL');
  return { url: session.url };
}

async function applyPro(organizationId, { customerId, subscriptionId, actorId = null } = {}) {
  const plan = await Plan.findOne({ where: { name: 'Pro' } });
  if (!plan) return null;
  const organization = await Organization.findByPk(organizationId);
  if (!organization) return null;
  const updates = {};
  if (customerId) updates.stripeCustomerId = customerId;
  if (subscriptionId) updates.stripeSubscriptionId = subscriptionId;
  if (Object.keys(updates).length) await organization.update(updates);
  const next = await setOrganizationPlan(organizationId, plan.id, { actorId });
  await broadcastOrganization(next);
  return next;
}

async function applyFree(organizationId) {
  const plan = await Plan.findOne({ where: { name: 'Free' } }) ?? (await Plan.findOne({ where: { isDefault: true } }));
  if (!plan) return null;
  const organization = await Organization.findByPk(organizationId);
  if (!organization) return null;
  await organization.update({ stripeSubscriptionId: null });
  const next = await setOrganizationPlan(organizationId, plan.id, { actorId: null });
  await broadcastOrganization(next);
  return next;
}

/** Stripe webhook handler — expects the raw body Buffer and Stripe-Signature header. */
export async function handleStripeWebhook(rawBody, signature) {
  if (!isCheckoutConfigured()) throw ApiError.badRequest('Stripe webhook is not configured');
  const client = stripe();
  let event;
  try {
    event = client.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (error) {
    throw ApiError.badRequest(`Webhook signature failed: ${error.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const organizationId = session.client_reference_id || session.metadata?.organizationId;
    if (organizationId && session.mode === 'subscription') {
      await applyPro(organizationId, {
        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        actorId: session.metadata?.userId ?? null,
      });
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return { received: true };
    const active = ['active', 'trialing'].includes(subscription.status);
    if (active) {
      await applyPro(organizationId, {
        customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
        subscriptionId: subscription.id,
      });
    } else if (event.type === 'customer.subscription.deleted' || ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
      await applyFree(organizationId);
    }
  }

  return { received: true };
}
