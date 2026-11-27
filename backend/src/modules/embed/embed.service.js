import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { EmbedApp, Organization, OrganizationMember, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { signAccessToken } from '../auth/token.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { logWorkspaceAction } from '../workspace/workspace-audit.service.js';

const PK_PREFIX = 'pk_live_';
const SK_PREFIX = 'sk_live_';
const MAX_APPS = 5;
/** Timing pad when the account is missing or has no password (same idea as login). */
const DUMMY_HASH = bcrypt.hashSync('vector-embed-timing', 10);

const hashSecret = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const newKeyPair = () => {
  const publishableKey = `${PK_PREFIX}${crypto.randomBytes(18).toString('base64url')}`;
  const secretKey = `${SK_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  return { publishableKey, secretKey, secretPrefix: secretKey.slice(0, 14), secretHash: hashSecret(secretKey) };
};

const toPublic = (row) => ({
  id: row.id,
  name: row.name,
  publishableKey: row.publishableKey,
  secretPrefix: row.secretPrefix,
  enabled: row.enabled,
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

function assertEmbedFeature(organization) {
  if (!entitlementsFor(organization).features.embedWorkspace) {
    throw ApiError.forbidden('The current plan does not include workspace embed');
  }
}

export async function listEmbedApps(organizationId) {
  const rows = await EmbedApp.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']] });
  return { apps: rows.map(toPublic) };
}

/** Creates embed credentials; `secretKey` is returned once and never stored in plaintext. */
export async function createEmbedApp(organization, actor, { name }) {
  assertEmbedFeature(organization);
  const label = String(name ?? '').trim().slice(0, 80);
  if (label.length < 2) throw ApiError.badRequest('Name must be at least 2 characters', [{ path: 'name', message: 'Name must be at least 2 characters' }]);
  const count = await EmbedApp.count({ where: { organizationId: organization.id } });
  if (count >= MAX_APPS) throw ApiError.badRequest(`You can have at most ${MAX_APPS} embed apps`);

  const keys = newKeyPair();
  const row = await EmbedApp.create({
    organizationId: organization.id,
    name: label,
    publishableKey: keys.publishableKey,
    secretPrefix: keys.secretPrefix,
    secretHash: keys.secretHash,
    createdById: actor.id,
  });
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'embed.created',
    targetType: 'embed_app',
    targetId: row.id,
    meta: { name: label, publishableKey: keys.publishableKey },
  });
  return { ...toPublic(row), secretKey: keys.secretKey };
}

export async function rotateEmbedSecret(organization, actor, appId) {
  assertEmbedFeature(organization);
  const row = await EmbedApp.findOne({ where: { id: appId, organizationId: organization.id } });
  if (!row) throw ApiError.notFound('Embed app not found');
  const keys = newKeyPair();
  await row.update({ secretPrefix: keys.secretPrefix, secretHash: keys.secretHash });
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'embed.secret_rotated',
    targetType: 'embed_app',
    targetId: row.id,
    meta: { name: row.name },
  });
  return { ...toPublic(row), secretKey: keys.secretKey };
}

export async function setEmbedAppEnabled(organization, actor, appId, enabled) {
  assertEmbedFeature(organization);
  const row = await EmbedApp.findOne({ where: { id: appId, organizationId: organization.id } });
  if (!row) throw ApiError.notFound('Embed app not found');
  await row.update({ enabled: Boolean(enabled) });
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: enabled ? 'embed.enabled' : 'embed.disabled',
    targetType: 'embed_app',
    targetId: row.id,
    meta: { name: row.name },
  });
  return toPublic(row);
}

export async function deleteEmbedApp(organization, actor, appId) {
  assertEmbedFeature(organization);
  const row = await EmbedApp.findOne({ where: { id: appId, organizationId: organization.id } });
  if (!row) throw ApiError.notFound('Embed app not found');
  await row.destroy();
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'embed.deleted',
    targetType: 'embed_app',
    targetId: appId,
    meta: { name: row.name },
  });
  return { deleted: true };
}

async function resolveEmbedApp({ publishableKey, secretKey }) {
  const pk = String(publishableKey ?? '').trim();
  const sk = String(secretKey ?? '').trim();
  if (!pk.startsWith(PK_PREFIX) || !sk.startsWith(SK_PREFIX) || sk.length < 24) {
    throw ApiError.unauthorized('Invalid embed keys');
  }
  const row = await EmbedApp.findOne({
    where: { publishableKey: pk, secretHash: hashSecret(sk), enabled: true },
    include: [{ model: Organization, as: 'organization', include: withPlan() }],
  });
  if (!row?.organization) throw ApiError.unauthorized('Invalid embed keys');
  assertEmbedFeature(row.organization);
  return row;
}

/**
 * Partner connect: publishable key + secret key + organization admin email/password.
 * Opens Vector as that admin. They invite and set up the team inside Vector afterward.
 */
export async function connectEmbed({ email, password, publishableKey, secretKey, path = null }) {
  const app = await resolveEmbedApp({ publishableKey, secretKey });
  const organization = app.organization;
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.scope('withSecrets').findOne({ where: { email: normalizedEmail } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !passwordOk) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active');

  const membership = await OrganizationMember.findOne({
    where: { organizationId: organization.id, userId: user.id, status: 'active' },
  });
  if (!membership) {
    throw ApiError.forbidden('This person is not in the organization for these embed keys');
  }
  if (membership.role !== 'admin') {
    throw ApiError.forbidden('Only an organization admin can connect a partner app. Ask an admin, or use an admin account.');
  }
  if (user.mfaEnabled) {
    throw ApiError.badRequest(
      'This admin has two-factor authentication on. Turn off 2FA temporarily to connect, or connect from Vector while signed in and share keys with your partner securely.',
    );
  }

  await user.update({ lastOrganizationId: organization.id });
  app.lastUsedAt = new Date();
  void app.save({ silent: true }).catch(() => undefined);

  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: user.id,
    action: 'embed.connect',
    targetType: 'embed_app',
    targetId: app.id,
    meta: { email: normalizedEmail, publishableKey: app.publishableKey },
  });

  const token = signAccessToken(user);
  const safePath = sanitizeEmbedPath(path);
  const embedUrl = appUrl(
    `/embed?token=${encodeURIComponent(token)}&pk=${encodeURIComponent(app.publishableKey)}${safePath ? `&next=${encodeURIComponent(safePath)}` : ''}`,
  );

  return {
    token,
    embedUrl,
    publishableKey: app.publishableKey,
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    user: { id: user.id, name: user.name, email: user.email, role: 'admin' },
  };
}

/** Only allow in-app relative paths (no open redirects). */
function sanitizeEmbedPath(path) {
  if (!path) return null;
  const value = String(path).trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) return null;
  return value.slice(0, 500);
}

/** Public metadata for the JS loader (pk only — never secrets). */
export async function publicEmbedApp(publishableKey) {
  const key = String(publishableKey ?? '').trim();
  if (!key.startsWith(PK_PREFIX)) throw ApiError.notFound('Embed app not found');
  const row = await EmbedApp.findOne({
    where: { publishableKey: key, enabled: true },
    include: [
      {
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name', 'slug', 'logoUrl', 'brandColor', 'planId', 'featureOverrides', 'billedSeats'],
        include: withPlan(),
      },
    ],
  });
  if (!row?.organization) throw ApiError.notFound('Embed app not found');
  assertEmbedFeature(row.organization);
  return {
    publishableKey: row.publishableKey,
    name: row.name,
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      logoUrl: row.organization.logoUrl,
      brandColor: row.organization.brandColor,
    },
  };
}
