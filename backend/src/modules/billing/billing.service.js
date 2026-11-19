import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { Organization, Plan } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../shared/logger.js';
import { recordFail, recordOk } from '../../shared/ops/signals.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { setOrganizationPlan, usageFor, withPlan } from '../plans/plan.service.js';
import { broadcastOrganization } from '../organizations/organization.service.js';

export const isCheckoutConfigured = () => Boolean(config.stripe.secretKey && config.stripe.webhookSecret && config.stripe.pricePro);

const stripe = () => {
  if (!config.stripe.secretKey) throw ApiError.badRequest('Card checkout is not configured on this server');
  return new Stripe(config.stripe.secretKey);
};

export function seatBounds() {
  return { minSeats: config.stripe.minSeats, maxSeats: config.stripe.maxSeats };
}

/** Clamp and validate a seat quantity for Checkout / updates. */
export function normalizeSeats(raw, { currentMembers = 1 } = {}) {
  const { minSeats, maxSeats } = seatBounds();
  const floor = Math.max(minSeats, currentMembers);
  const parsed = Number.parseInt(raw, 10);
  const seats = Number.isFinite(parsed) ? parsed : floor;
  if (seats < floor) {
    throw ApiError.badRequest(`Choose at least ${floor} seats (you already have ${currentMembers} people).`);
  }
  if (seats > maxSeats) {
    throw ApiError.badRequest(`Self-serve plans allow up to ${maxSeats} seats. Contact us for more.`);
  }
  return seats;
}

/** Server + this organization: whether Checkout / Customer Portal are available. */
export function billingStatus(organization = null) {
  const checkoutEnabled = isCheckoutConfigured();
  return {
    checkoutEnabled,
    trialDays: checkoutEnabled ? config.stripe.trialDays : 0,
    /** Stripe Customer Portal (card, invoices, cancel) — needs a customer from a prior checkout. */
    portalEnabled: checkoutEnabled && Boolean(organization?.stripeCustomerId),
    hasSubscription: Boolean(organization?.stripeSubscriptionId),
    billedSeats: organization?.billedSeats ?? null,
    ...seatBounds(),
  };
}

async function ensureCustomer(organization, user) {
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
  return customerId;
}

function subscriptionSeats(subscription) {
  const item = subscription?.items?.data?.find((entry) => entry.price?.id === config.stripe.pricePro) ?? subscription?.items?.data?.[0];
  const quantity = item?.quantity;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

/**
 * Starts Stripe Checkout for Pro billed per seat, or updates an existing subscription’s quantity.
 * @param {{ seats?: number }} options
 */
export async function createProCheckout(organization, user, options = {}) {
  if (!isCheckoutConfigured()) {
    throw new ApiError(503, 'Card checkout is not configured. Request an upgrade instead, or set STRIPE_* on the server.', {
      code: 'billing_not_configured',
    });
  }
  const plan = await Plan.findOne({ where: { name: 'Pro' } });
  if (!plan) throw ApiError.badRequest('Pro plan is not available');

  const usage = await usageFor(organization.id);
  const seats = normalizeSeats(options.seats, { currentMembers: usage.members || 1 });

  // Already subscribed: change quantity in place (proration) instead of a second Checkout.
  if (organization.stripeSubscriptionId) {
    return updateSubscriptionSeats(organization, seats);
  }

  const client = stripe();
  const customerId = await ensureCustomer(organization, user);
  const trialDays = config.stripe.trialDays;
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: organization.id,
    line_items: [{ price: config.stripe.pricePro, quantity: seats }],
    success_url: appUrl('/workspace-admin?tab=plan&billing=success'),
    cancel_url: appUrl('/workspace-admin?tab=plan&billing=cancel'),
    metadata: { organizationId: organization.id, planId: plan.id, userId: user.id, seats: String(seats) },
    subscription_data: {
      metadata: { organizationId: organization.id, planId: plan.id, seats: String(seats) },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
  });
  if (!session.url) throw ApiError.badRequest('Stripe did not return a checkout URL');
  return { url: session.url, seats, mode: 'checkout' };
}

/** Change seat quantity on the current Stripe subscription (prorated). */
export async function updateSubscriptionSeats(organization, rawSeats) {
  if (!isCheckoutConfigured()) {
    throw new ApiError(503, 'Card checkout is not configured.', { code: 'billing_not_configured' });
  }
  if (!organization.stripeSubscriptionId) {
    throw ApiError.badRequest('No active subscription. Start a Pro checkout first.');
  }

  const usage = await usageFor(organization.id);
  const seats = normalizeSeats(rawSeats, { currentMembers: usage.members || 1 });
  const client = stripe();
  const subscription = await client.subscriptions.retrieve(organization.stripeSubscriptionId);
  if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
    throw ApiError.badRequest('Subscription is not active. Start a new checkout or open Manage billing.');
  }

  const item =
    subscription.items.data.find((entry) => entry.price?.id === config.stripe.pricePro) ?? subscription.items.data[0];
  if (!item) throw ApiError.badRequest('Subscription has no billable seat item');

  if (item.quantity === seats) {
    await organization.update({ billedSeats: seats });
    const next = await Organization.findByPk(organization.id, { include: withPlan() });
    if (next) await broadcastOrganization(next);
    return { seats, mode: 'unchanged', url: null };
  }

  const updated = await client.subscriptions.update(organization.stripeSubscriptionId, {
    items: [{ id: item.id, quantity: seats }],
    proration_behavior: 'create_prorations',
    metadata: {
      ...(subscription.metadata ?? {}),
      organizationId: organization.id,
      seats: String(seats),
    },
  });

  await applyPro(organization.id, {
    customerId: typeof updated.customer === 'string' ? updated.customer : organization.stripeCustomerId,
    subscriptionId: updated.id,
    seats: subscriptionSeats(updated) ?? seats,
  });

  return { seats: subscriptionSeats(updated) ?? seats, mode: 'updated', url: null };
}

/**
 * Opens Stripe Customer Portal for the organization: update card, download invoices, cancel.
 * Requires a Stripe customer from a previous Checkout (or any saved stripeCustomerId).
 */
export async function createBillingPortal(organization) {
  if (!isCheckoutConfigured()) {
    throw new ApiError(503, 'Billing portal is not configured. Set STRIPE_* on the server.', {
      code: 'billing_not_configured',
    });
  }
  if (!organization.stripeCustomerId) {
    throw ApiError.badRequest('No billing account yet. Start a Pro checkout first, then you can manage card and invoices here.');
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: appUrl('/workspace-admin?tab=plan&billing=portal'),
  });
  if (!session.url) throw ApiError.badRequest('Stripe did not return a portal URL');
  return { url: session.url };
}

async function organizationIdFromSubscription(subscription) {
  if (subscription.metadata?.organizationId) return subscription.metadata.organizationId;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const organization = await Organization.findOne({ where: { stripeCustomerId: customerId }, attributes: ['id'] });
  return organization?.id ?? null;
}

async function applyPro(organizationId, { customerId, subscriptionId, seats = null, actorId = null } = {}) {
  const plan = await Plan.findOne({ where: { name: 'Pro' } });
  if (!plan) return null;
  const organization = await Organization.findByPk(organizationId);
  if (!organization) return null;
  const updates = {};
  if (customerId) updates.stripeCustomerId = customerId;
  if (subscriptionId) updates.stripeSubscriptionId = subscriptionId;
  if (Number.isFinite(seats) && seats > 0) updates.billedSeats = seats;
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
  await organization.update({ stripeSubscriptionId: null, billedSeats: null });
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
    recordFail('stripe', 'webhook', error);
    logger.error('stripe webhook signature failed', { area: 'stripe', error });
    throw ApiError.badRequest(`Webhook signature failed: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const organizationId = session.client_reference_id || session.metadata?.organizationId;
      if (organizationId && session.mode === 'subscription') {
        let seats = Number.parseInt(session.metadata?.seats, 10) || null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subscriptionId && !seats) {
          const subscription = await client.subscriptions.retrieve(subscriptionId);
          seats = subscriptionSeats(subscription);
        }
        await applyPro(organizationId, {
          customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          subscriptionId,
          seats,
          actorId: session.metadata?.userId ?? null,
        });
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const organizationId = await organizationIdFromSubscription(subscription);
      if (!organizationId) {
        recordOk('stripe', 'webhook');
        return { received: true };
      }
      // cancel_at_period_end keeps status active/trialing until the period ends — stay on Pro until then.
      const active = ['active', 'trialing'].includes(subscription.status);
      if (active) {
        await applyPro(organizationId, {
          customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
          subscriptionId: subscription.id,
          seats: subscriptionSeats(subscription),
        });
      } else if (event.type === 'customer.subscription.deleted' || ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
        await applyFree(organizationId);
      }
    }

    recordOk('stripe', 'webhook');
    logger.info('stripe webhook handled', { area: 'stripe', eventType: event.type });
    return { received: true };
  } catch (error) {
    recordFail('stripe', 'webhook', error);
    logger.error('stripe webhook handler failed', { area: 'stripe', eventType: event?.type, error });
    throw error;
  }
}
