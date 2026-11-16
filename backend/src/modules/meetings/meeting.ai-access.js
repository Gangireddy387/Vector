import { Organization } from '../../database/models.js';
import { isAiEnabled } from '../ai/openai.client.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';

/**
 * Meeting AI that needs the language model (notes from speech, translation, in-call ask, meaning search)
 * requires an OpenAI key and the organization's AI assistant feature.
 * Extractive meeting summaries can run on plan alone when the key is missing.
 */

const CACHE_MS = 60_000;
const cache = new Map();

async function planAllowsAi(organizationId) {
  if (!organizationId) return false;
  const known = cache.get(organizationId);
  if (known && known.until > Date.now()) return known.allowed;
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  const allowed = Boolean(organization && entitlementsFor(organization).features.aiAssistant);
  cache.set(organizationId, { allowed, until: Date.now() + CACHE_MS });
  return allowed;
}

/** Live AI notes / ask / embeddings: key + plan. */
export async function meetingAiAllowed(organizationId) {
  if (!isAiEnabled()) return false;
  return planAllowsAi(organizationId);
}

/** Written summaries (OpenAI when available, extractive fallback otherwise): plan only. */
export async function meetingSummariesAllowed(organizationId) {
  return planAllowsAi(organizationId);
}

/** Plan or feature changes take effect at once on this server. */
export const forgetMeetingAiAccess = (organizationId) => cache.delete(organizationId);
