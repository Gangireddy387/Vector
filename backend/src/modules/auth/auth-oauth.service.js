import { config } from '../../config/index.js';
import { User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { pickAvatarColor } from '../users/user.service.js';
import { describeSession } from './auth.service.js';
import { isLoginOAuthState, signAccessToken, signLoginOAuthState, signMfaToken, verifyAccessToken } from './token.js';
import { resolveOrganization } from '../organizations/organization-access.js';
import { assertOAuthLoginAllowed, publicSso } from '../organizations/organization-sso.js';
import { Organization } from '../../database/models.js';

const TIMEOUT_MS = 15_000;
const PLACEHOLDER = /your-client|^(?:\.\.\.|xxx)/i;

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
};

function safeRedirect(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.slice(0, 300);
}

/** Returns the provider authorize URL for “Continue with Google/Microsoft”. */
export async function startOAuthLogin(provider, { redirect = '/', organizationSlug = null, microsoftTenant = null } = {}) {
  const entry = providers[provider];
  if (!entry) throw ApiError.badRequest('Unknown sign-in provider');
  if (!entry.ready()) throw new ApiError(503, `${provider} sign-in is not configured on this server`, { code: 'oauth_not_configured' });

  let tenant = typeof microsoftTenant === 'string' && microsoftTenant.trim() ? microsoftTenant.trim() : null;
  if (!tenant && organizationSlug && provider === 'microsoft') {
    const organization = await Organization.findOne({ where: { slug: String(organizationSlug).toLowerCase() } });
    const sso = publicSso(organization, { includeTenant: true });
    if (sso.microsoftTenant) tenant = sso.microsoftTenant;
  }

  const state = signLoginOAuthState({
    provider,
    redirect: safeRedirect(redirect),
    ...(tenant ? { microsoftTenant: tenant } : {}),
  });
  return { url: entry.authUrl(state, { microsoftTenant: tenant }) };
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
 * Finishes Google/Microsoft sign-in and redirects the browser to the SPA with a short-lived session or MFA challenge.
 */
export async function completeOAuthLogin(provider, { code, state, error }) {
  const fail = (reason) => appUrl(`/login?oauthError=${encodeURIComponent(reason)}`);
  if (error) return fail(String(error));
  if (!code || !state) return fail('Sign-in was cancelled');

  const entry = providers[provider];
  if (!entry?.ready()) return fail('This sign-in provider is not configured');

  let payload;
  try {
    payload = verifyAccessToken(state);
  } catch {
    return fail('That sign-in link expired. Try again.');
  }
  if (!isLoginOAuthState(payload) || payload.provider !== provider) return fail('Invalid sign-in state');

  let profile;
  try {
    profile = await entry.exchange(code, { microsoftTenant: payload.microsoftTenant || null });
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
  if (user.mfaEnabled && user.mfaSecret) {
    return appUrl(`/login?mfaToken=${encodeURIComponent(signMfaToken(user))}&redirect=${encodeURIComponent(redirect)}`);
  }

  await user.update({ lastSeenAt: new Date() });
  const token = signAccessToken(user);
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
  const user = await User.findByPk(userId, { attributes: ['googleSubject', 'microsoftSubject'] });
  return {
    google: Boolean(user?.googleSubject),
    microsoft: Boolean(user?.microsoftSubject),
  };
}
