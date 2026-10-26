import { Organization, OrganizationMember } from '../../database/models.js';
import { withPlan } from '../plans/plan.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Active organization memberships of a user, oldest first. */
export const listActiveMemberships = (userId) =>
  OrganizationMember.findAll({
    where: { userId, status: 'active' },
    include: [{ model: Organization, as: 'organization', include: withPlan() }],
    order: [['createdAt', 'ASC']],
  });

/**
 * Picks the organization a request works in: the one the client asked for (X-Organization-Id) when the user
 * belongs to it, otherwise the one they used last, otherwise their first.
 */
export async function resolveOrganization(user, requestedId) {
  const memberships = await listActiveMemberships(user.id);
  const pick = (id) => (id && UUID_PATTERN.test(id) ? memberships.find((membership) => membership.organizationId === id) : null);
  const membership = pick(requestedId) ?? pick(user.lastOrganizationId) ?? memberships[0] ?? null;
  return { membership, memberships };
}
