import { config } from '../../config/index.js';
import { Organization, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { pickAvatarColor } from '../users/user.service.js';
import { withPlan } from '../plans/plan.service.js';
import {
  assertOAuthLoginAllowed,
  oidcClientSecret,
  organizationHasSsoFeature,
  publicOidc,
  publicSso,
} from '../organizations/organization-sso.js';
import { describeSession } from './auth.service.js';
import { isLoginOAuthState, signAccessToken, signLoginOAuthState, signMfaToken, verifyAccessToken } from './token.js';
import { resolveOrganization } from '../organizations/organization-access.js';
import { logAuthForUser } from '../workspace/workspace-audit.service.js';

const TIMEOUT_MS = 15_000;
const PLACEHOLDER = /your-client|^(?:\.\.\.|xxx)/i;

/** Short-lived discovery cache (issuer → metadata). */
const discoveryCache = new Map();

const publicApi = () => config.calendar.publicApiUrl;
const redirectUri = (provider) => `${publicApi()}/api/auth/oauth/${provider}/callback`;

const googleReady = () =>
  Boolean(config.calendar.google.clientId && config.calendar.google.clientSecret && !PLACEHOLDER.test(config.calendar.google.clientId));
const microsoftReady = () =>
  Boolean(config.calendar.microsoft.clientId && config.calendar.microsoft.clientSecret && !PLACEHOLDER.test(config.calendar.microsoft.clientId));

export function oauthProvidersStatus() {
  return {
    google: googleReady(),
    microsoft: microsoftReady(),
    /** Generic OIDC is configured per organization when Enterprise SSO is on. */
    oidc: true,
  };
}

async function call(url, { method = 'GET', form, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error_description || body?.error || `OAuth failed (${response.status})`);
  }
  return body;
}

function decodeIdToken(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function discoverOidc(issuer) {
  const key = String(issuer).replace(/\/+$/, '');
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.meta;
  const url = `${key}/.well-known/openid-configuration`;
  const meta = await call(url);
  if (!meta?.authorization_endpoint || !meta?.token_endpoint) {
    throw new Error('OIDC discovery did not return authorization and token endpoints');
  }
  discoveryCache.set(key, { meta, expiresAt: Date.now() + 10 * 60_000 });
  return meta;
}

async function loadOidcOrganization(organizationIdOrSlug) {
  if (!organizationIdOrSlug) return null;
  const include = withPlan();
  const byId =
    typeof organizationIdOrSlug === 'string' && organizationIdOrSlug.includes('-')
      ? await Organization.findByPk(organizationIdOrSlug, { include })
      : null;
  if (byId) return byId;
  return Organization.findOne({
    where: { slug: String(organizationIdOrSlug).toLowerCase() },
    include,
  });
}

function assertOidcOrgReady(organization) {
  if (!organization) throw ApiError.notFound('Organization not found');
  if (!organizationHasSsoFeature(organization)) {
    throw ApiError.forbidden('Enterprise SSO is not included in this organization’s plan');
  }
  const sso = publicSso(organization, { includeOidc: true });
  if (!sso.enabled || sso.provider !== 'oidc') {
    throw ApiError.badRequest('This organization is not using OpenID Connect SSO');
  }
  const oidc = publicOidc(organization);
  const secret = oidcClientSecret(organization);
  if (!oidc.issuer || !oidc.clientId || !secret) {
    throw new ApiError(503, 'OpenID Connect is not fully configured for this organization', { code: 'oauth_not_configured' });
  }
  return { sso, oidc, secret };
}

const providers = {
  google: {
    ready: googleReady,
    authUrl: (state) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: config.calendar.google.clientId,
        redirect_uri: redirectUri('google'),
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state,
      })}`,
    async exchange(code) {
      const body = await call('https://oauth2.googleapis.com/token', {
        method: 'POST',
        form: {
          code,
          client_id: config.calendar.google.clientId,
          client_secret: config.calendar.google.clientSecret,
          redirect_uri: redirectUri('google'),
          grant_type: 'authorization_code',
        },
      });
      const claims = decodeIdToken(body.id_token);
      return {
        subject: claims.sub ? String(claims.sub) : null,
        email: (claims.email || '').toLowerCase(),
        name: claims.name || claims.email || 'Google user',
        emailVerified: Boolean(claims.email_verified),
      };
    },
    subjectField: 'googleSubject',
  },
  microsoft: {
    ready: microsoftReady,
    authUrl: (state, { microsoftTenant } = {}) => {
      const tenant = microsoftTenant || config.calendar.microsoft.tenant || 'common';
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${new URLSearchParams({
        client_id: config.calendar.microsoft.clientId,
        redirect_uri: redirectUri('microsoft'),
        response_type: 'code',
        scope: 'openid email profile offline_access',
        response_mode: 'query',
        state,
      })}`;
    },
    async exchange(code, { microsoftTenant } = {}) {
      const tenant = microsoftTenant || config.calendar.microsoft.tenant || 'common';
      const body = await call(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        form: {
          code,
          client_id: config.calendar.microsoft.clientId,
          client_secret: config.calendar.microsoft.clientSecret,
          redirect_uri: redirectUri('microsoft'),
          grant_type: 'authorization_code',
        },
      });
      const claims = decodeIdToken(body.id_token);
      return {
        subject: claims.sub || claims.oid ? String(claims.sub || claims.oid) : null,
        email: (claims.email || claims.preferred_username || '').toLowerCase(),
        name: claims.name || claims.preferred_username || 'Microsoft user',
        emailVerified: true,
        tenantId: claims.tid ? String(claims.tid) : null,
      };
    },
    subjectField: 'microsoftSubject',
  },
  oidc: {
    ready: () => true,
    async authUrl(state, { organization } = {}) {
      const { oidc } = assertOidcOrgReady(organization);
      const meta = await discoverOidc(oidc.issuer);
      return `${meta.authorization_endpoint}?${new URLSearchParams({
        client_id: oidc.clientId,
        redirect_uri: redirectUri('oidc'),
        response_type: 'code',
        scope: oidc.scopes || 'openid email profile',
        state,
      })}`;
    },
    async exchange(code, { organization } = {}) {
      const { oidc, secret } = assertOidcOrgReady(organization);
      const meta = await discoverOidc(oidc.issuer);
      const body = await call(meta.token_endpoint, {
        method: 'POST',
        form: {
          code,
          client_id: oidc.clientId,
          client_secret: secret,
          redirect_uri: redirectUri('oidc'),
          grant_type: 'authorization_code',
        },
      });
      if (!body.id_token) throw new Error('OIDC token response did not include an id_token');
      const claims = decodeIdToken(body.id_token);
      const expectedIss = oidc.issuer.replace(/\/+$/, '');
      const claimIss = claims.iss ? String(claims.iss).replace(/\/+$/, '') : '';
      if (claimIss && claimIss !== expectedIss) {
        throw new Error('OIDC id_token issuer does not match the configured issuer');
      }
      if (claims.aud) {
        const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
        if (!aud.includes(oidc.clientId)) throw new Error('OIDC id_token audience does not match the client ID');
      }
      if (claims.exp && Number(claims.exp) * 1000 < Date.now() - 60_000) {
        throw new Error('OIDC id_token has expired');
      }
      const sub = claims.sub ? String(claims.sub) : null;
      const email = (claims.email || claims.preferred_username || '').toLowerCase();
      const emailVerified =
        claims.email_verified === undefined || claims.email_verified === null
          ? Boolean(email)
          : Boolean(claims.email_verified);
      return {
        subject: sub ? `${expectedIss}|${sub}` : null,
        email,
        name: claims.name || claims.preferred_username || email || 'SSO user',
        emailVerified,
        organizationId: organization.id,
      };
    },
    subjectField: 'oidcSubject',
  },
};

function safeRedirect(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.slice(0, 300);
}

/** Returns the provider authorize URL for “Continue with Google/Microsoft/SSO”. */
export async function startOAuthLogin(
  provider,
  { redirect = '/', organizationSlug = null, microsoftTenant = null } = {},
) {
  const entry = providers[provider];
  if (!entry) throw ApiError.badRequest('Unknown sign-in provider');

  let tenant = typeof microsoftTenant === 'string' && microsoftTenant.trim() ? microsoftTenant.trim() : null;
  let organization = null;

  if (provider === 'oidc') {
    if (!organizationSlug) throw ApiError.badRequest('Organization is required for OpenID Connect sign-in');
    organization = await loadOidcOrganization(organizationSlug);
    assertOidcOrgReady(organization);
  } else if (!entry.ready()) {
    throw new ApiError(503, `${provider} sign-in is not configured on this server`, { code: 'oauth_not_configured' });
  }

  if (!tenant && organizationSlug && provider === 'microsoft') {
    organization = await Organization.findOne({ where: { slug: String(organizationSlug).toLowerCase() } });
    const sso = publicSso(organization, { includeTenant: true });
    if (sso.microsoftTenant) tenant = sso.microsoftTenant;
  }

  const state = signLoginOAuthState({
    provider,
    redirect: safeRedirect(redirect),
    ...(tenant ? { microsoftTenant: tenant } : {}),
    ...(organization ? { organizationId: organization.id } : {}),
  });

  const url =
    typeof entry.authUrl === 'function'
      ? await entry.authUrl(state, { microsoftTenant: tenant, organization })
      : entry.authUrl(state, { microsoftTenant: tenant, organization });
  return { url };
}

async function findOrCreateUser(provider, profile) {
  const entry = providers[provider];
  if (!profile.email || !profile.email.includes('@')) throw ApiError.badRequest('The provider did not return an email address');
  if (!profile.emailVerified) throw ApiError.badRequest('Verify your email with the provider, then try again');

  let user = null;
  if (profile.subject) {
    user = await User.scope('withSecrets').findOne({ where: { [entry.subjectField]: profile.subject } });
  }
  if (!user) {
    user = await User.scope('withSecrets').findOne({ where: { email: profile.email } });
  }
  if (user) {
    if (user.status !== 'active') throw ApiError.forbidden('This account is not active');
    const patch = {};
    if (profile.subject && !user[entry.subjectField]) patch[entry.subjectField] = profile.subject;
    if (Object.keys(patch).length) await user.update(patch);
    return user;
  }

  const data = {
    name: String(profile.name).slice(0, 120),
    email: profile.email,
    passwordHash: null,
    avatarColor: pickAvatarColor(profile.email),
    status: 'active',
  };
  if (profile.subject) data[entry.subjectField] = profile.subject;
  return User.create(data);
}

/**
 * Finishes Google/Microsoft/OIDC sign-in and redirects the browser to the SPA with a short-lived session or MFA challenge.
 */
export async function completeOAuthLogin(provider, { code, state, error }, auditMeta = {}) {
  const fail = (reason) => appUrl(`/login?oauthError=${encodeURIComponent(reason)}`);
  if (error) return fail(String(error));
  if (!code || !state) return fail('Sign-in was cancelled');

  const entry = providers[provider];
  if (!entry) return fail('Unknown sign-in provider');
  if (provider !== 'oidc' && !entry.ready()) return fail('This sign-in provider is not configured');

  let payload;
  try {
    payload = verifyAccessToken(state);
  } catch {
    return fail('That sign-in link expired. Try again.');
  }
  if (!isLoginOAuthState(payload) || payload.provider !== provider) return fail('Invalid sign-in state');

  let organization = null;
  if (provider === 'oidc') {
    if (!payload.organizationId) return fail('Missing organization for OpenID Connect sign-in');
    organization = await loadOidcOrganization(payload.organizationId);
    try {
      assertOidcOrgReady(organization);
    } catch (err) {
      return fail(err.message || 'OpenID Connect is not configured');
    }
  }

  let profile;
  try {
    profile = await entry.exchange(code, {
      microsoftTenant: payload.microsoftTenant || null,
      organization,
    });
  } catch (err) {
    return fail(err.message || 'Could not finish sign-in with the provider');
  }

  try {
    await assertOAuthLoginAllowed(provider, profile);
  } catch (err) {
    return fail(err.message || 'This sign-in is not allowed for your organization');
  }

  let user;
  try {
    user = await findOrCreateUser(provider, profile);
  } catch (err) {
    return fail(err.message || 'Could not create or find your account');
  }

  const redirect = safeRedirect(payload.redirect);
  const method = provider === 'google' || provider === 'microsoft' || provider === 'oidc' ? provider : 'oidc';
  if (user.mfaEnabled && user.mfaSecret) {
    return appUrl(`/login?mfaToken=${encodeURIComponent(signMfaToken(user, { method }))}&redirect=${encodeURIComponent(redirect)}`);
  }

  await user.update({ lastSeenAt: new Date() });
  const token = signAccessToken(user);
  void logAuthForUser(user.id, { action: 'auth.login', meta: { method, mfa: false, ...auditMeta } });
  return appUrl(`/login?oauthToken=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`);
}

/** Optional: session payload for a just-issued oauth access token (SPA can also call /auth/me). */
export async function sessionFromAccessToken(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
  if (payload?.typ && payload.typ !== 'access') throw ApiError.unauthorized();
  const user = await User.findByPk(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized();
  const { membership, memberships } = await resolveOrganization(user, user.lastOrganizationId);
  return { token, ...(await describeSession(user, membership, memberships)) };
}

export async function listLinkedProviders(userId) {
  const user = await User.findByPk(userId, { attributes: ['googleSubject', 'microsoftSubject', 'oidcSubject'] });
  return {
    google: Boolean(user?.googleSubject),
    microsoft: Boolean(user?.microsoftSubject),
    oidc: Boolean(user?.oidcSubject),
  };
}
