import { Op } from 'sequelize';
import { Organization, OrganizationMember } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { decryptSecret, encryptSecret } from '../auth/mfa.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';

export const SSO_PROVIDERS = ['google', 'microsoft', 'oidc'];

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const ISSUER_RE = /^https:\/\/[^\s]+$/i;

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

function normalizeIssuer(raw) {
  if (!raw) return null;
  const issuer = String(raw).trim().replace(/\/+$/, '');
  if (!issuer) return null;
  if (issuer.startsWith('http://localhost') || issuer.startsWith('http://127.0.0.1')) return issuer;
  if (!ISSUER_RE.test(issuer)) {
    throw ApiError.badRequest('OIDC issuer must be an https URL', [{ path: 'sso.oidc.issuer', message: 'Use an https issuer URL' }]);
  }
  return issuer;
}

function rawOidc(organization) {
  const sso = organization?.sso && typeof organization.sso === 'object' ? organization.sso : {};
  return sso.oidc && typeof sso.oidc === 'object' ? sso.oidc : {};
}

function normalizeClaimName(value, fallback) {
  const raw = String(value ?? '').trim().slice(0, 80);
  if (!raw) return fallback;
  if (!/^[A-Za-z0-9_.:/-]+$/.test(raw)) return fallback;
  return raw;
}

/** Public OIDC fields (never includes the client secret). */
export function publicOidc(organization) {
  const oidc = rawOidc(organization);
  const issuer = oidc.issuer ? String(oidc.issuer).trim().replace(/\/+$/, '') : null;
  const clientId = oidc.clientId ? String(oidc.clientId).trim() : null;
  return {
    issuer,
    clientId,
    scopes: oidc.scopes ? String(oidc.scopes).trim() || 'openid email profile' : 'openid email profile',
    emailClaim: normalizeClaimName(oidc.emailClaim, 'email'),
    nameClaim: normalizeClaimName(oidc.nameClaim, 'name'),
    clientSecretConfigured: Boolean(oidc.clientSecret),
  };
}

/** Decrypt the stored OIDC client secret for the authorization code exchange. */
export function oidcClientSecret(organization) {
  const encrypted = rawOidc(organization).clientSecret;
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch {
    return null;
  }
}

/** Public / settings shape for SSO (no secrets). */
export function publicSso(organization, { includeTenant = false, includeOidc = false } = {}) {
  const sso = organization?.sso && typeof organization.sso === 'object' ? organization.sso : {};
  const enabled = Boolean(sso.enabled);
  const provider = SSO_PROVIDERS.includes(sso.provider) ? sso.provider : 'microsoft';
  return {
    enabled,
    enforce: Boolean(enabled && sso.enforce),
    provider,
    allowedDomains: normalizeDomains(sso.allowedDomains),
    ...(includeTenant ? { microsoftTenant: sso.microsoftTenant ? String(sso.microsoftTenant).trim() || null : null } : {}),
    ...(includeOidc ? { oidc: publicOidc(organization) } : {}),
  };
}

export function organizationHasSsoFeature(organization) {
  return Boolean(entitlementsFor(organization).features.sso);
}

export function providerLabel(provider) {
  if (provider === 'google') return 'Google';
  if (provider === 'microsoft') return 'Microsoft';
  if (provider === 'oidc') return 'SSO';
  return provider;
}

/**
 * Validates and returns the SSO JSON to store. Requires the Enterprise `sso` plan feature.
 * Passing `oidc.clientSecret: ""` keeps the previously stored secret.
 */
export function cleanSsoInput(raw, organization) {
  if (!organizationHasSsoFeature(organization)) {
    throw ApiError.forbidden('Enterprise SSO is not included in your plan. Ask the portal administrator to enable it.');
  }
  const current = publicSso(organization, { includeTenant: true, includeOidc: true });
  const previousOidc = rawOidc(organization);
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

  let oidc = null;
  if (provider === 'oidc') {
    const incoming = next.oidc && typeof next.oidc === 'object' ? next.oidc : {};
    const issuer = normalizeIssuer(incoming.issuer ?? current.oidc?.issuer);
    const clientId = String(incoming.clientId ?? current.oidc?.clientId ?? '')
      .trim()
      .slice(0, 200);
    const scopes = String(incoming.scopes ?? current.oidc?.scopes ?? 'openid email profile')
      .trim()
      .slice(0, 200) || 'openid email profile';
    const emailClaim = normalizeClaimName(incoming.emailClaim ?? current.oidc?.emailClaim, 'email');
    const nameClaim = normalizeClaimName(incoming.nameClaim ?? current.oidc?.nameClaim, 'name');
    if (enabled && (!issuer || !clientId)) {
      throw ApiError.badRequest('OIDC issuer and client ID are required', [
        { path: 'sso.oidc.issuer', message: 'Required for OpenID Connect' },
      ]);
    }
    let clientSecret = previousOidc.clientSecret ?? null;
    if (Object.prototype.hasOwnProperty.call(incoming, 'clientSecret')) {
      const plain = incoming.clientSecret == null ? '' : String(incoming.clientSecret);
      if (plain.trim()) clientSecret = encryptSecret(plain.trim());
      // Empty string keeps the previous secret (UI leave-blank semantics).
    }
    if (enabled && !clientSecret) {
      throw ApiError.badRequest('OIDC client secret is required', [
        { path: 'sso.oidc.clientSecret', message: 'Required for OpenID Connect' },
      ]);
    }
    oidc = { issuer, clientId: clientId || null, clientSecret, scopes, emailClaim, nameClaim };
    microsoftTenant = null;
  }

  return {
    enabled,
    enforce,
    provider,
    allowedDomains,
    microsoftTenant: provider === 'microsoft' ? microsoftTenant : null,
    ...(oidc ? { oidc } : provider === 'oidc' ? { oidc: previousOidc } : {}),
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
  const label = providerLabel(sso.provider);
  throw new ApiError(403, `Your organization requires ${label} sign-in. Use Continue with ${label} instead of a password.`, {
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
      throw ApiError.forbidden(`Sign in to ${organization.name} with ${providerLabel(sso.provider)}, not ${provider}.`);
    }
    if (provider === 'microsoft' && sso.microsoftTenant) {
      const tid = profile.tenantId ? String(profile.tenantId) : null;
      if (!tid || tid.toLowerCase() !== sso.microsoftTenant.toLowerCase()) {
        throw ApiError.forbidden(`Use the ${organization.name} Microsoft work account (wrong directory).`);
      }
    }
    if (provider === 'oidc' && profile.organizationId && profile.organizationId !== organization.id && sso.enforce) {
      throw ApiError.forbidden(`Sign in with ${organization.name}'s SSO provider.`);
    }
  }
}

/** Settings payload helpers. */
export function ssoSettingsFor(organization) {
  if (!organizationHasSsoFeature(organization)) {
    return { available: false, ...publicSso(null, { includeTenant: true, includeOidc: true }) };
  }
  return { available: true, ...publicSso(organization, { includeTenant: true, includeOidc: true }) };
}
