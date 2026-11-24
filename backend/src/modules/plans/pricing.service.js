import { emitToAll } from '../../shared/realtime/socket.js';
import { WorkspaceSetting } from '../workspace/workspace-setting.model.js';
import { Plan } from './plan.model.js';

export const PRICING_CURRENCIES = ['INR', 'USD'];

const DEFAULTS = {
  currency: 'INR',
  /** Monthly list prices in each currency (display + plan label sync). */
  proAmountInr: 999,
  proAmountUsd: 12,
  enterpriseAmountInr: 2499,
  enterpriseAmountUsd: 29,
};

const clampAmount = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.round(number), 1_000_000);
};

export function normalizePricing(raw = {}) {
  const currency = PRICING_CURRENCIES.includes(raw.currency) ? raw.currency : DEFAULTS.currency;
  return {
    currency,
    proAmountInr: clampAmount(raw.proAmountInr, DEFAULTS.proAmountInr),
    proAmountUsd: clampAmount(raw.proAmountUsd, DEFAULTS.proAmountUsd),
    enterpriseAmountInr: clampAmount(raw.enterpriseAmountInr, DEFAULTS.enterpriseAmountInr),
    enterpriseAmountUsd: clampAmount(raw.enterpriseAmountUsd, DEFAULTS.enterpriseAmountUsd),
  };
}

/** Format a monthly list-price label for the active (or given) currency. */
export function formatMonthlyPriceLabel(amountInr, amountUsd, currency = 'INR') {
  const amount = currency === 'USD' ? amountUsd : amountInr;
  if (currency === 'USD') return `$${amount} / month`;
  return `₹${amount} / month`;
}

export function formatProPriceLabel(pricing = DEFAULTS, currency = pricing.currency) {
  return formatMonthlyPriceLabel(pricing.proAmountInr, pricing.proAmountUsd, currency);
}

export function formatEnterprisePriceLabel(pricing = DEFAULTS, currency = pricing.currency) {
  return formatMonthlyPriceLabel(pricing.enterpriseAmountInr, pricing.enterpriseAmountUsd, currency);
}

async function settingsRow() {
  const [row] = await WorkspaceSetting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, name: 'Vector', defaultMode: 'system' },
  });
  return row;
}

async function findPlanByName(name) {
  const plans = await Plan.findAll({ order: [['position', 'ASC'], ['name', 'ASC']] });
  const needle = name.trim().toLowerCase();
  return plans.find((plan) => plan.name.trim().toLowerCase() === needle) ?? null;
}

async function syncPlanLabel(planName, label) {
  const plan = await findPlanByName(planName);
  if (!plan) return null;
  if (plan.priceLabel === label) return plan;
  await plan.update({ priceLabel: label });
  return plan;
}

/** Keep Pro + Enterprise plan labels in sync with the portal currency amounts. */
async function syncPaidPlanLabels(pricing) {
  await syncPlanLabel('pro', formatProPriceLabel(pricing));
  await syncPlanLabel('enterprise', formatEnterprisePriceLabel(pricing));
}

/** Portal display currency + Pro/Enterprise amounts (super-admin editable). */
export async function getPricingSettings() {
  const row = await settingsRow();
  return { pricing: normalizePricing(row.pricing ?? {}) };
}

export async function updatePricingSettings(changes = {}, actorId = null) {
  const row = await settingsRow();
  const next = normalizePricing({ ...(row.pricing ?? {}), ...changes });
  row.pricing = next;
  if (actorId) row.updatedById = actorId;
  await row.save();
  await syncPaidPlanLabels(next);
  emitToAll('pricing:updated', { pricing: next });
  return { pricing: next };
}

function displayPriceLabel(plan, pricing) {
  const name = plan.name.trim().toLowerCase();
  if (name === 'pro') return formatProPriceLabel(pricing);
  if (name === 'enterprise') return formatEnterprisePriceLabel(pricing);
  return plan.priceLabel;
}

/** Public marketing payload: currency + plan cards with current price labels. */
export async function getPublicPricing() {
  const { pricing } = await getPricingSettings();
  const plans = await Plan.findAll({ order: [['position', 'ASC'], ['name', 'ASC']] });
  return {
    pricing,
    plans: plans.map((plan) => ({
      name: plan.name,
      description: plan.description,
      priceLabel: displayPriceLabel(plan, pricing),
      maxMembers: plan.maxMembers,
      maxProjects: plan.maxProjects,
      isDefault: plan.isDefault,
      position: plan.position,
    })),
  };
}
