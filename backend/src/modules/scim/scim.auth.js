import { ApiError } from '../../shared/errors/api-error.js';
import { resolveScimToken } from './scim.service.js';

/** Bearer vscim_… → req.scimOrganization. Mounted only on /scim/v2. */
export async function requireScimAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw ApiError.unauthorized('SCIM bearer token required');
    const resolved = await resolveScimToken(match[1].trim());
    if (!resolved) throw ApiError.unauthorized('Invalid or revoked SCIM token');
    req.scimOrganization = resolved.organization;
    req.scimToken = resolved.token;
    next();
  } catch (error) {
    next(error);
  }
}
