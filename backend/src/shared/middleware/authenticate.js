import { ApiError } from '../errors/api-error.js';
import { verifyAccessToken } from '../../modules/auth/token.js';
import { User } from '../../database/models.js';
import { resolveOrganization } from '../../modules/organizations/organization-access.js';
import { runWithContext } from '../context/request-context.js';

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await User.findByPk(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized();

  const { membership, memberships } = await resolveOrganization(user, req.headers['x-organization-id']);
  req.user = user;
  req.organization = membership?.organization ?? null;
  req.organizationRole = membership?.role ?? null;
  req.organizationMemberships = memberships;
  return runWithContext({ userId: user.id, organizationId: req.organization?.id ?? null, organizationRole: req.organizationRole }, next);
}

/** For routes that only make sense inside an organization (everything except account and organization setup). */
export function requireOrganization(req, _res, next) {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  next();
}

export function requireOrganizationAdmin(req, _res, next) {
  if (!req.organization) throw new ApiError(409, 'Create or join an organization first', { code: 'no_organization' });
  if (req.organizationRole !== 'admin') throw ApiError.forbidden('Only organization admins can do this');
  next();
}
