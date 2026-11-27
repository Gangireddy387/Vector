import { ApiError } from '../errors/api-error.js';
import { resolveApiToken } from '../../modules/auth/api-token.service.js';
import { isAccessToken, isRevoked, verifyAccessToken } from '../../modules/auth/token.js';
import { embedSessionInvalidReason } from '../../modules/embed/embed-session.js';
import { User } from '../../database/models.js';
import { resolveOrganization } from '../../modules/organizations/organization-access.js';
import { resolveMembershipPermissions } from '../../modules/organizations/organization-role.service.js';
import { ORG_PERMISSION_KEYS } from '../../modules/organizations/organization-role.constants.js';
import { runWithContext } from '../context/request-context.js';

const LAST_SEEN_INTERVAL_MS = 60_000;

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let user = null;
  if (token.startsWith('vtk_')) {
    user = await resolveApiToken(token);
    if (!user) throw ApiError.unauthorized('Invalid or expired API token');
    req.authVia = 'api_token';
  } else {
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    if (!isAccessToken(payload)) throw ApiError.unauthorized();

    user = await User.findByPk(payload.sub);
    if (!user || user.status !== 'active') throw ApiError.unauthorized();
    if (isRevoked(payload, user)) throw ApiError.unauthorized('Your password was changed. Please sign in again.');
    const embedReason = await embedSessionInvalidReason(payload);
    if (embedReason) throw ApiError.unauthorized(embedReason);
    req.authVia = 'session';
    req.embedAppId = payload.eid || null;
  }

  // "Last seen" follows real use, not just sign-in; at most one write a minute per person.
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
    user.lastSeenAt = new Date();
    void User.update({ lastSeenAt: user.lastSeenAt }, { where: { id: user.id }, silent: true }).catch(() => undefined);
  }

  const { membership, memberships } = await resolveOrganization(user, req.headers['x-organization-id']);
  req.user = user;
  req.organization = membership?.organization ?? null;
  req.organizationRole = membership?.role ?? null;
  req.organizationMembership = membership ?? null;
  req.organizationPermissions = membership
    ? await resolveMembershipPermissions(membership, membership.organization)
    : [];
  req.organizationMemberships = memberships;
  return runWithContext(
    {
      userId: user.id,
      organizationId: req.organization?.id ?? null,
      organizationRole: req.organizationRole,
      organizationPermissions: req.organizationPermissions,
    },
    next,
  );
}

/** Pending and rejected organizations cannot use the portal until the super admin approves them. */
function assertApproved(organization) {
  if (organization.status === 'pending') throw new ApiError(403, 'This organization is waiting for approval', { code: 'organization_pending' });
  if (organization.status === 'rejected') throw new ApiError(403, 'This organization was not approved', { code: 'organization_rejected' });
}

/** For routes that only make sense inside an organization (everything except account and organization setup). */
export function requireOrganization(req, _res, next) {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  assertApproved(req.organization);
  next();
}

/** New organizations come from admins; people in no organization yet may still create their first. */
export function requireOrganizationCreator(req, _res, next) {
  const memberships = req.organizationMemberships ?? [];
  if (memberships.length && !memberships.some((membership) => membership.role === 'admin')) {
    throw ApiError.forbidden('Only organization admins can create organizations');
  }
  next();
}

export function requireOrganizationAdmin(req, _res, next) {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  assertApproved(req.organization);
  if (req.organizationRole !== 'admin') throw ApiError.forbidden('Only organization admins can do this');
  next();
}

/**
 * Allows built-in admins, or members whose custom role includes the permission.
 * Use for delegated workspace areas (people, billing, structure…).
 */
export const requireOrgPermission = (permission) => (req, _res, next) => {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  assertApproved(req.organization);
  if (!ORG_PERMISSION_KEYS.includes(permission)) throw ApiError.forbidden('Unknown permission');
  if (req.organizationRole === 'admin') return next();
  if ((req.organizationPermissions ?? []).includes(permission)) return next();
  throw ApiError.forbidden('You do not have permission to do this');
};

/** Any of the listed permissions (or admin) is enough. */
export const requireAnyOrgPermission = (...permissions) => (req, _res, next) => {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  assertApproved(req.organization);
  if (req.organizationRole === 'admin') return next();
  const granted = new Set(req.organizationPermissions ?? []);
  if (permissions.some((permission) => granted.has(permission))) return next();
  throw ApiError.forbidden('You do not have permission to do this');
};
