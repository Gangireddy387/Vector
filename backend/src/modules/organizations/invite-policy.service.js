import { ApiError } from '../../shared/errors/api-error.js';
import { normalizeDomains } from './organization-sso.js';

const DEFAULT_INVITE_POLICY = Object.freeze({
  /** When true, only emails on `allowedDomains` may be invited into the organization. */
  restrictDomains: false,
  allowedDomains: [],
});

export function publicInvitePolicy(organization) {
  const raw = organization?.invitePolicy && typeof organization.invitePolicy === 'object' ? organization.invitePolicy : {};
  return {
    restrictDomains: Boolean(raw.restrictDomains),
    allowedDomains: normalizeDomains(raw.allowedDomains),
  };
}

/** Validates and returns invite-policy JSON to store. */
export function normalizeInvitePolicy(input) {
  const next = { ...DEFAULT_INVITE_POLICY, ...(input && typeof input === 'object' ? input : {}) };
  const allowedDomains = normalizeDomains(next.allowedDomains);
  const restrictDomains = Boolean(next.restrictDomains);
  if (restrictDomains && !allowedDomains.length) {
    throw ApiError.badRequest('Add at least one email domain when restricting invitations', [
      { path: 'invitePolicy.allowedDomains', message: 'Add at least one email domain' },
    ]);
  }
  return { restrictDomains, allowedDomains };
}

function emailDomain(email) {
  const at = String(email || '')
    .trim()
    .toLowerCase()
    .lastIndexOf('@');
  if (at < 0) return '';
  return String(email)
    .trim()
    .toLowerCase()
    .slice(at + 1);
}

/**
 * Blocks inviting people whose email domain is outside the organization allowlist.
 * Existing organization members are not checked (already in).
 */
export function assertInviteEmailAllowed(organization, email) {
  const policy = publicInvitePolicy(organization);
  if (!policy.restrictDomains) return;
  const domain = emailDomain(email);
  if (!domain || !policy.allowedDomains.includes(domain)) {
    const list = policy.allowedDomains.join(', ');
    throw ApiError.forbidden(
      list
        ? `Invitations are limited to these email domains: ${list}.`
        : 'Invitations are limited to approved email domains.',
      { code: 'invite_domain', domains: policy.allowedDomains },
    );
  }
}
