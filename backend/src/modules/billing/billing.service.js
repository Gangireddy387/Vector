import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { Organization, Plan } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../shared/logger.js';
import { recordFail, recordOk } from '../../shared/ops/signals.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { setOrganizationPlan, usageFor, withPlan } from '../plans/plan.service.js';
import { broadcastOrganization } from '../organizations/organization.service.js';

export const PAID_PLANS = ['pro', 'enterprise'];

const stripeKeysReady = () => Boolean(config.stripe.secretKey && config.stripe.webhookSecret);

/** True when at least one self-serve paid plan price is configured. */
export const isCheckoutConfigured = () =>
  Boolean(stripeKeysReady() && (config.stripe.pricePro || config.stripe.priceEnterprise));

export const isProCheckoutConfigured = () => Boolean(stripeKeysReady() && config.stripe.pricePro);
export const isEnterpriseCheckoutConfigured = () => Boolean(stripeKeysReady() && config.stripe.priceEnterprise);

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

function normalizePlanKey(raw) {
  const key = String(raw || 'pro')
    .trim()
    .toLowerCase();
  if (!PAID_PLANS.includes(key)) throw ApiError.badRequest('Choose pro or enterprise');
  return key;
}

function planDisplayName(planKey) {
  return planKey === 'enterprise' ? 'Enterprise' : 'Pro';
}

function priceForPlan(planKey) {
  return planKey === 'enterprise' ? config.stripe.priceEnterprise : config.stripe.pricePro;
}

function trialDaysForPlan(planKey) {
  return planKey === 'enterprise' ? config.stripe.trialDaysEnterprise : config.stripe.trialDays;
}

function assertPlanCheckoutConfigured(planKey) {
  if (!stripeKeysReady()) {
    throw new ApiError(503, 'Card checkout is not configured. Request an upgrade instead, or set STRIPE_* on the server.', {
      code: 'billing_not_configured',
    });
  }
  const priceId = priceForPlan(planKey);
  if (!priceId) {
    const env = planKey === 'enterprise' ? 'STRIPE_PRICE_ENTERPRISE' : 'STRIPE_PRICE_PRO';
    throw new ApiError(503, `${planDisplayName(planKey)} checkout is not configured. Set ${env} on the server.`, {
      code: 'billing_not_configured',
      plan: planKey,
    });
  }
  return priceId;
}

function planKeyFromPriceId(priceId) {
  if (!priceId) return null;
  if (priceId === config.stripe.priceEnterprise) return 'enterprise';
  if (priceId === config.stripe.pricePro) return 'pro';
  return null;
}

/** Server + this organization: whether Checkout / Customer Portal are available. */
export function billingStatus(organization = null) {
  const checkoutEnabled = isCheckoutConfigured();
  return {
    checkoutEnabled,
    proCheckoutEnabled: isProCheckoutConfigured(),
    enterpriseCheckoutEnabled: isEnterpriseCheckoutConfigured(),
    trialDays: isProCheckoutConfigured() ? config.stripe.trialDays : 0,
    enterpriseTrialDays: isEnterpriseCheckoutConfigured() ? config.stripe.trialDaysEnterprise : 0,
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

function subscriptionSeatItem(subscription) {
  const prices = [config.stripe.priceEnterprise, config.stripe.pricePro].filter(Boolean);
  return (
    subscription?.items?.data?.find((entry) => prices.includes(entry.price?.id)) ?? subscription?.items?.data?.[0] ?? null
  );
}

function subscriptionSeats(subscription) {
  const item = subscriptionSeatItem(subscription);
  const quantity = item?.quantity;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function subscriptionPlanKey(subscription) {
  const item = subscriptionSeatItem(subscription);
  return planKeyFromPriceId(item?.price?.id) || (subscription.metadata?.planKey ? normalizePlanKey(subscription.metadata.planKey) : null);
}

/**
 * Starts Stripe Checkout for Pro or Enterprise (per seat), updates seats, or swaps plan on an existing subscription.
 * @param {{ seats?: number, plan?: 'pro'|'enterprise' }} options
 */
export async function createCheckout(organization, user, options = {}) {
  const planKey = normalizePlanKey(options.plan);
  const priceId = assertPlanCheckoutConfigured(planKey);
  const plan = await Plan.findOne({ where: { name: planDisplayName(planKey) } });
  if (!plan) throw ApiError.badRequest(`${planDisplayName(planKey)} plan is not available`);

  const usage = await usageFor(organization.id);
  const seats = normalizeSeats(options.seats, { currentMembers: usage.members || 1 });

  if (organization.stripeSubscriptionId) {
    return updateSubscription(organization, { seats, planKey, priceId, plan });
  }

  const client = stripe();
  const customerId = await ensureCustomer(organization, user);
  const trialDays = trialDaysForPlan(planKey);
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: organization.id,
    line_items: [{ price: priceId, quantity: seats }],
    success_url: appUrl(`/workspace-admin?tab=plan&billing=success&plan=${planKey}`),
    cancel_url: appUrl('/workspace-admin?tab=plan&billing=cancel'),
    metadata: {
      organizationId: organization.id,
      planId: plan.id,
      planKey,
      userId: user.id,
      seats: String(seats),
    },
    subscription_data: {
      metadata: { organizationId: organization.id, planId: plan.id, planKey, seats: String(seats) },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
  });
  if (!session.url) throw ApiError.badRequest('Stripe did not return a checkout URL');
  return { url: session.url, seats, mode: 'checkout', plan: planKey };
}

/** @deprecated Prefer createCheckout({ plan: 'pro' }). */
export async function createProCheckout(organization, user, options = {}) {
  return createCheckout(organization, user, { ...options, plan: 'pro' });
}

async function updateSubscription(organization, { seats, planKey, priceId, plan }) {
  const client = stripe();
  const subscription = await client.subscriptions.retrieve(organization.stripeSubscriptionId);
  if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
    throw ApiError.badRequest('Subscription is not active. Start a new checkout or open Manage billing.');
  }

  const item = subscriptionSeatItem(subscription);
  if (!item) throw ApiError.badRequest('Subscription has no billable seat item');

  const currentPlanKey = subscriptionPlanKey(subscription);
  const samePrice = item.price?.id === priceId;
  const sameSeats = item.quantity === seats;

  if (samePrice && sameSeats) {
    await organization.update({ billedSeats: seats });
    const next = await Organization.findByPk(organization.id, { include: withPlan() });
    if (next) await broadcastOrganization(next);
    return { seats, mode: 'unchanged', url: null, plan: planKey };
  }

  const updated = await client.subscriptions.update(organization.stripeSubscriptionId, {
    items: samePrice ? [{ id: item.id, quantity: seats }] : [{ id: item.id, price: priceId, quantity: seats }],
    proration_behavior: 'create_prorations',
    metadata: {
      ...(subscription.metadata ?? {}),
      organizationId: organization.id,
      planId: plan.id,
      planKey,
      seats: String(seats),
    },
  });

  await applyPaidPlan(organization.id, plan, {
    customerId: typeof updated.customer === 'string' ? updated.customer : organization.stripeCustomerId,
    subscriptionId: updated.id,
    seats: subscriptionSeats(updated) ?? seats,
  });

  return {
    seats: subscriptionSeats(updated) ?? seats,
    mode: samePrice ? 'updated' : 'plan_changed',
    url: null,
    plan: planKey,
    previousPlan: currentPlanKey,
  };
}

/** Change seat quantity on the current Stripe subscription (prorated); keeps the current paid plan. */
export async function updateSubscriptionSeats(organization, rawSeats) {
  if (!isCheckoutConfigured()) {
    throw new ApiError(503, 'Card checkout is not configured.', { code: 'billing_not_configured' });
  }
  if (!organization.stripeSubscriptionId) {
    throw ApiError.badRequest('No active subscription. Start a checkout first.');
  }

  const client = stripe();
  const subscription = await client.subscriptions.retrieve(organization.stripeSubscriptionId);
  const planKey = subscriptionPlanKey(subscription) || 'pro';
  const priceId = assertPlanCheckoutConfigured(planKey);
  const plan = await Plan.findOne({ where: { name: planDisplayName(planKey) } });
  if (!plan) throw ApiError.badRequest(`${planDisplayName(planKey)} plan is not available`);

  const usage = await usageFor(organization.id);
  const seats = normalizeSeats(rawSeats, { currentMembers: usage.members || 1 });
  return updateSubscription(organization, { seats, planKey, priceId, plan });
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
    throw ApiError.badRequest('No billing account yet. Start a checkout first, then you can manage card and invoices here.');
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

async function resolvePlanFromMetadata({ planId, planKey, priceId } = {}) {
  if (planId) {
    const byId = await Plan.findByPk(planId);
    if (byId) return byId;
  }
  if (planKey && PAID_PLANS.includes(String(planKey).toLowerCase())) {
    const byKey = await Plan.findOne({ where: { name: planDisplayName(String(planKey).toLowerCase()) } });
    if (byKey) return byKey;
  }
  const fromPrice = planKeyFromPriceId(priceId);
  if (fromPrice) return Plan.findOne({ where: { name: planDisplayName(fromPrice) } });
  return Plan.findOne({ where: { name: 'Pro' } });
}

async function applyPaidPlan(organizationId, plan, { customerId, subscriptionId, seats = null, actorId = null } = {}) {
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
        let priceId = null;
        if (subscriptionId) {
          const subscription = await client.subscriptions.retrieve(subscriptionId);
          seats = seats || subscriptionSeats(subscription);
          priceId = subscriptionSeatItem(subscription)?.price?.id ?? null;
        }
        const plan = await resolvePlanFromMetadata({
          planId: session.metadata?.planId,
          planKey: session.metadata?.planKey,
          priceId,
        });
        await applyPaidPlan(organizationId, plan, {
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
      // cancel_at_period_end keeps status active/trialing until the period ends — stay on paid plan until then.
      const active = ['active', 'trialing'].includes(subscription.status);
      if (active) {
        const plan = await resolvePlanFromMetadata({
          planId: subscription.metadata?.planId,
          planKey: subscription.metadata?.planKey || subscriptionPlanKey(subscription),
          priceId: subscriptionSeatItem(subscription)?.price?.id,
        });
        await applyPaidPlan(organizationId, plan, {
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
