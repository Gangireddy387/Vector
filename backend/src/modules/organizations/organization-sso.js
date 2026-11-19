import { Op } from 'sequelize';
import { Organization, OrganizationMember } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';

export const SSO_PROVIDERS = ['google', 'microsoft'];

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function emailDomain(email) {
  const at = String(email || '')
    .trim()
    .toLowerCase()
    .split('@');
  return at.length === 2 && at[1] ? at[1] : null;
}

export function normalizeDomains(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [
    ...new Set(
      list
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase()
            .replace(/^@/, ''),
        )
        .filter((domain) => DOMAIN_RE.test(domain)),
    ),
  ].slice(0, 25);
}

/** Public / settings shape for SSO (no secrets). */
export function publicSso(organization, { includeTenant = false } = {}) {
  const sso = organization?.sso && typeof organization.sso === 'object' ? organization.sso : {};
  const enabled = Boolean(sso.enabled);
  return {
    enabled,
    enforce: Boolean(enabled && sso.enforce),
    provider: SSO_PROVIDERS.includes(sso.provider) ? sso.provider : 'microsoft',
    allowedDomains: normalizeDomains(sso.allowedDomains),
    ...(includeTenant ? { microsoftTenant: sso.microsoftTenant ? String(sso.microsoftTenant).trim() || null : null } : {}),
  };
}

export function organizationHasSsoFeature(organization) {
  return Boolean(entitlementsFor(organization).features.sso);
}

/**
 * Validates and returns the SSO JSON to store. Requires the Enterprise `sso` plan feature.
 */
export function cleanSsoInput(raw, organization) {
  if (!organizationHasSsoFeature(organization)) {
    throw ApiError.forbidden('Enterprise SSO is not included in your plan. Ask the portal administrator to enable it.');
  }
  const current = publicSso(organization, { includeTenant: true });
  const next = { ...current, ...(raw && typeof raw === 'object' ? raw : {}) };
  const allowedDomains = normalizeDomains(next.allowedDomains);
  const provider = SSO_PROVIDERS.includes(next.provider) ? next.provider : 'microsoft';
  const enabled = Boolean(next.enabled);
  const enforce = Boolean(enabled && next.enforce);
  let microsoftTenant = next.microsoftTenant == null || next.microsoftTenant === '' ? null : String(next.microsoftTenant).trim();
  if (microsoftTenant && !/^[a-z0-9-]{8,64}$/i.test(microsoftTenant)) {
    throw ApiError.badRequest('Microsoft tenant must be a directory (tenant) ID', [
      { path: 'sso.microsoftTenant', message: 'Use the Azure AD tenant GUID' },
    ]);
  }
  if (enforce && !allowedDomains.length) {
    throw ApiError.badRequest('Add at least one email domain when enforcing SSO', [
      { path: 'sso.allowedDomains', message: 'Add at least one email domain' },
    ]);
  }
  if (provider === 'google') microsoftTenant = null;
  return {
    enabled,
    enforce,
    provider,
    allowedDomains,
    microsoftTenant: provider === 'microsoft' ? microsoftTenant : null,
  };
}

async function loadSsoOrganizations() {
  return Organization.findAll({
    where: {
      status: 'approved',
      sso: { [Op.ne]: null },
    },
    include: withPlan(),
  });
}

function orgMatchesDomain(organization, domain) {
  if (!domain) return false;
  const sso = publicSso(organization);
  return sso.enabled && sso.allowedDomains.includes(domain);
}

/**
 * Organizations that enforce SSO for this email (domain match or existing membership).
 * Used to block password sign-in.
 */
export async function findEnforcedSsoForEmail(email, { userId = null } = {}) {
  const domain = emailDomain(email);
  const orgs = (await loadSsoOrganizations()).filter((organization) => {
    if (!organizationHasSsoFeature(organization)) return false;
    const sso = publicSso(organization);
    return sso.enforce;
  });

  const byDomain = domain ? orgs.filter((organization) => orgMatchesDomain(organization, domain)) : [];
  if (byDomain.length) return byDomain[0];

  if (!userId) return null;
  const memberships = await OrganizationMember.findAll({
    where: { userId, status: 'active', organizationId: orgs.map((organization) => organization.id) },
    attributes: ['organizationId'],
  });
  const memberOrgIds = new Set(memberships.map((row) => row.organizationId));
  return orgs.find((organization) => memberOrgIds.has(organization.id)) ?? null;
}

/** Blocks password login / self-serve register when SSO is enforced for the email. */
export async function assertPasswordLoginAllowed(email, { userId = null } = {}) {
  const organization = await findEnforcedSsoForEmail(email, { userId });
  if (!organization) return;
  const sso = publicSso(organization);
  const providerLabel = sso.provider === 'google' ? 'Google' : 'Microsoft';
  throw new ApiError(403, `Your organization requires ${providerLabel} sign-in. Use Continue with ${providerLabel} instead of a password.`, {
    code: 'sso_required',
    provider: sso.provider,
    organizationSlug: organization.slug,
  });
}

/**
 * After OAuth profile exchange: enforce provider + Microsoft tenant for domain-matched SSO orgs.
 */
export async function assertOAuthLoginAllowed(provider, profile) {
  const domain = emailDomain(profile.email);
  if (!domain) return;

  const orgs = (await loadSsoOrganizations()).filter((organization) => {
    if (!organizationHasSsoFeature(organization)) return false;
    return orgMatchesDomain(organization, domain);
  });
  if (!orgs.length) return;

  for (const organization of orgs) {
    const sso = publicSso(organization, { includeTenant: true });
    if (sso.enforce && sso.provider !== provider) {
      const want = sso.provider === 'google' ? 'Google' : 'Microsoft';
      throw ApiError.forbidden(`Sign in to ${organization.name} with ${want}, not ${provider}.`);
    }
    if (provider === 'microsoft' && sso.microsoftTenant) {
      const tid = profile.tenantId ? String(profile.tenantId) : null;
      if (!tid || tid.toLowerCase() !== sso.microsoftTenant.toLowerCase()) {
        throw ApiError.forbidden(`Use the ${organization.name} Microsoft work account (wrong directory).`);
      }
    }
  }
}

/** Settings payload helpers. */
export function ssoSettingsFor(organization) {
  if (!organizationHasSsoFeature(organization)) {
    return { available: false, ...publicSso(null, { includeTenant: true }) };
  }
  return { available: true, ...publicSso(organization, { includeTenant: true }) };
}
