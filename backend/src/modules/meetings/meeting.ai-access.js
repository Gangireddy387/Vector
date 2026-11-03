import { Organization } from '../../database/models.js';
import { isAiEnabled } from '../ai/openai.client.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';

/**
 * Meeting AI (notes from speech, translation, the in-call assistant, summaries, agendas, meaning-based search) runs
 * only when the server has an OpenAI key and the organization's plan includes the AI assistant. Plans change rarely,
 * so the answer is kept for a minute.
 */

const CACHE_MS = 60_000;
const cache = new Map();

export async function meetingAiAllowed(organizationId) {
  if (!isAiEnabled() || !organizationId) return false;
  const known = cache.get(organizationId);
  if (known && known.until > Date.now()) return known.allowed;
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  const allowed = Boolean(organization && entitlementsFor(organization).features.aiAssistant);
  cache.set(organizationId, { allowed, until: Date.now() + CACHE_MS });
  return allowed;
}

/** Plan or feature changes take effect at once on this server. */
export const forgetMeetingAiAccess = (organizationId) => cache.delete(organizationId);
