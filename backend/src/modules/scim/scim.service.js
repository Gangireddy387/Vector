import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Organization, OrganizationMember, Project, ScimToken, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { revokeRealtimeAccess } from '../../shared/realtime/socket.js';
import { assertWithinLimit, entitlementsFor, withPlan } from '../plans/plan.service.js';
import { pickAvatarColor } from '../users/user.service.js';
import { logWorkspaceAction } from '../workspace/workspace-audit.service.js';
import {
  activeFromScim,
  applyScimPatch,
  emailFromScim,
  nameFromScim,
  parseUserNameFilter,
  toScimList,
  toScimUser,
} from './scim.mapper.js';

const PREFIX = 'vscim_';
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const toPublicToken = (row) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
});

export function organizationHasScimFeature(organization) {
  return Boolean(entitlementsFor(organization).features.scim);
}

export function scimBaseUrl() {
  return `${config.calendar.publicApiUrl}/api/scim/v2`;
}

export function scimSettingsFor(organization) {
  const available = organizationHasScimFeature(organization);
  return {
    available,
    baseUrl: available ? scimBaseUrl() : null,
  };
}

export async function listScimTokens(organizationId) {
  const rows = await ScimToken.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']] });
  return { tokens: rows.map(toPublicToken), baseUrl: scimBaseUrl() };
}

export async function createScimToken(organization, actor, { name }) {
  if (!organizationHasScimFeature(organization)) {
    throw ApiError.forbidden('SCIM provisioning is not included in your plan. Ask the portal administrator to enable it.');
  }
  const label = String(name ?? '').trim().slice(0, 80);
  if (label.length < 2) {
    throw ApiError.badRequest('Name must be at least 2 characters', [{ path: 'name', message: 'Name must be at least 2 characters' }]);
  }
  const count = await ScimToken.count({ where: { organizationId: organization.id } });
  if (count >= 10) throw ApiError.badRequest('You can have at most 10 SCIM tokens');

  const secret = crypto.randomBytes(24).toString('base64url');
  const raw = `${PREFIX}${secret}`;
  const row = await ScimToken.create({
    organizationId: organization.id,
    name: label,
    prefix: raw.slice(0, 14),
    tokenHash: hashToken(raw),
  });
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'scim.token_created',
    targetType: 'scim_token',
    targetId: row.id,
    meta: { name: label, prefix: row.prefix },
  });
  return { token: raw, ...toPublicToken(row), baseUrl: scimBaseUrl() };
}

export async function revokeScimToken(organization, actor, tokenId) {
  const deleted = await ScimToken.destroy({ where: { id: tokenId, organizationId: organization.id } });
  if (!deleted) throw ApiError.notFound('SCIM token not found');
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'scim.token_revoked',
    targetType: 'scim_token',
    targetId: tokenId,
    meta: {},
  });
  return { deleted: true };
}

/** Resolves a SCIM bearer token to an organization (with plan), or null. */
export async function resolveScimToken(raw) {
  if (!raw?.startsWith(PREFIX) || raw.length < 20) return null;
  const row = await ScimToken.findOne({ where: { tokenHash: hashToken(raw) } });
  if (!row) return null;
  const organization = await Organization.findByPk(row.organizationId, { include: withPlan() });
  if (!organization || organization.status !== 'approved') return null;
  if (!organizationHasScimFeature(organization)) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    row.lastUsedAt = new Date();
    void row.save({ silent: true }).catch(() => undefined);
  }
  return { organization, token: row };
}

function userLocation(userId) {
  return `${scimBaseUrl()}/Users/${userId}`;
}

async function loadMemberUser(organizationId, userId) {
  const membership = await OrganizationMember.findOne({
    where: { organizationId, userId },
    include: [{ model: User, as: 'user' }],
  });
  if (!membership?.user) return null;
  return { user: membership.user, membership };
}

async function projectIdsOf(organizationId) {
  return (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
}

async function setMembershipActive(organizationId, user, membership, active) {
  const nextStatus = active ? 'active' : 'disabled';
  if (membership.status === nextStatus) return membership;
  if (active && membership.status === 'disabled') await assertWithinLimit(organizationId, 'members');
  if (membership.role === 'admin' && !active) {
    const others = await OrganizationMember.count({
      where: { organizationId, role: 'admin', status: 'active', userId: { [Op.ne]: user.id } },
    });
    if (!others) throw ApiError.badRequest('The organization needs at least one active admin');
  }
  await membership.update({ status: nextStatus });
  if (!active) revokeRealtimeAccess(user.id, { organizationId, projectIds: await projectIdsOf(organizationId) });
  await logWorkspaceAction({
    organizationId,
    actorId: null,
    action: active ? 'member.reactivated' : 'member.deactivated',
    targetType: 'user',
    targetId: user.id,
    meta: { email: user.email, source: 'scim' },
  });
  return membership;
}

/**
 * Provisions a member from SCIM without sending invitation email.
 * New accounts are created active (SSO / set-password later); no invite token.
 */
async function provisionMember(organization, { email, name, active }) {
  let user = await User.scope('withSecrets').findOne({ where: { email } });
  const existingMembership = user
    ? await OrganizationMember.findOne({ where: { organizationId: organization.id, userId: user.id } })
    : null;

  if (existingMembership) {
    throw Object.assign(ApiError.conflict(`User ${email} already exists`), { scimType: 'uniqueness' });
  }

  if (!user) {
    await assertWithinLimit(organization.id, 'members');
    user = await User.create({
      name: name || email.split('@')[0],
      email,
      passwordHash: null,
      avatarColor: pickAvatarColor(email),
      status: 'active',
      lastOrganizationId: organization.id,
    });
  } else {
    await assertWithinLimit(organization.id, 'members');
    if (user.status === 'invited' || user.status === 'disabled') {
      await user.update({ status: 'active', inviteToken: null, name: name || user.name });
    } else if (name && name !== user.name) {
      await user.update({ name });
    }
  }

  const membership = await OrganizationMember.create({
    organizationId: organization.id,
    userId: user.id,
    role: 'member',
    status: active ? 'active' : 'disabled',
  });

  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: null,
    action: 'member.invited',
    targetType: 'user',
    targetId: user.id,
    meta: { email, role: 'member', source: 'scim', invited: false },
  });

  return { user, membership };
}

export async function listScimUsers(organization, { filter, startIndex = 1, count = 100 } = {}) {
  const start = Math.max(1, Number(startIndex) || 1);
  const limit = Math.min(Math.max(Number(count) || 100, 1), 200);
  const parsed = parseUserNameFilter(filter);
  if (filter && parsed === undefined) {
    throw ApiError.badRequest('Only filter=userName eq "email" is supported');
  }

  const memberWhere = { organizationId: organization.id };
  const userWhere = {};
  if (parsed) userWhere.email = parsed;

  const { rows, count: total } = await OrganizationMember.findAndCountAll({
    where: memberWhere,
    include: [{ model: User, as: 'user', required: true, where: Object.keys(userWhere).length ? userWhere : undefined }],
    order: [[{ model: User, as: 'user' }, 'email', 'ASC']],
    offset: start - 1,
    limit,
  });

  const resources = rows.map((membership) => toScimUser(membership.user, membership, { location: userLocation(membership.user.id) }));
  return toScimList(resources, { totalResults: total, startIndex: start, itemsPerPage: resources.length });
}

export async function getScimUser(organization, userId) {
  const loaded = await loadMemberUser(organization.id, userId);
  if (!loaded) throw ApiError.notFound('User not found');
  return toScimUser(loaded.user, loaded.membership, { location: userLocation(loaded.user.id) });
}

export async function createScimUser(organization, body) {
  const email = emailFromScim(body);
  if (!email || !EMAIL_RE.test(email)) throw ApiError.badRequest('userName or emails.value must be a valid email');
  const name = nameFromScim(body, email);
  const active = activeFromScim(body, true);
  const { user, membership } = await provisionMember(organization, { email, name, active });
  return { status: 201, resource: toScimUser(user, membership, { location: userLocation(user.id) }) };
}

async function applyUserUpdate(organization, user, membership, draft) {
  const email = emailFromScim(draft) || user.email;
  if (email !== user.email) {
    throw ApiError.badRequest('Changing userName/email via SCIM is not supported');
  }
  const name = nameFromScim(draft, email);
  if (name && name !== user.name) await user.update({ name });
  if (user.status === 'invited') await user.update({ status: 'active', inviteToken: null });
  const active = activeFromScim(draft, membership.status !== 'disabled');
  await setMembershipActive(organization.id, user, membership, active);
  const refreshed = await loadMemberUser(organization.id, user.id);
  return toScimUser(refreshed.user, refreshed.membership, { location: userLocation(user.id) });
}

export async function replaceScimUser(organization, userId, body) {
  const loaded = await loadMemberUser(organization.id, userId);
  if (!loaded) throw ApiError.notFound('User not found');
  return applyUserUpdate(organization, loaded.user, loaded.membership, body);
}

export async function patchScimUser(organization, userId, body) {
  const loaded = await loadMemberUser(organization.id, userId);
  if (!loaded) throw ApiError.notFound('User not found');
  const current = toScimUser(loaded.user, loaded.membership);
  const draft = applyScimPatch(current, body);
  return applyUserUpdate(organization, loaded.user, loaded.membership, draft);
}

/** Soft-deactivate (SCIM DELETE). Does not remove the membership row. */
export async function deleteScimUser(organization, userId) {
  const loaded = await loadMemberUser(organization.id, userId);
  if (!loaded) throw ApiError.notFound('User not found');
  await setMembershipActive(organization.id, loaded.user, loaded.membership, false);
}
