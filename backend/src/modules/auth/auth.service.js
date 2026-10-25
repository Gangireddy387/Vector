import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { passwordResetEmail } from '../../shared/services/email-templates.js';
import { createOneTimeToken, hashOneTimeToken, signAccessToken } from './token.js';
import { listMyOrganizations, resolveOrganization, toPublicOrganization } from '../organizations/index.js';
import { checkSlug, createOrganization } from '../organizations/organization.service.js';
import { pickAvatarColor } from '../users/user.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const hashPassword = (password) => bcrypt.hash(password, 10);

/**
 * What the app needs about the signed-in person: their profile (with `workspaceRole` meaning their role in the
 * current organization), the current organization and every organization they can switch to.
 */
export async function describeSession(user, membership, memberships) {
  return {
    user: { ...user.toJSON(), workspaceRole: membership?.role ?? 'member' },
    organization: membership ? { ...toPublicOrganization(membership.organization), role: membership.role } : null,
    organizations: await listMyOrganizations(memberships),
  };
}

const buildSession = async (user) => {
  await user.update({ lastSeenAt: new Date() });
  const { membership, memberships } = await resolveOrganization(user, user.lastOrganizationId);
  return { token: signAccessToken(user), ...(await describeSession(user, membership, memberships)) };
};

/** Signing up creates the person's account and their organization, which they administer. */
export async function register({ name, email, password, organizationName, organizationSlug }) {
  const existing = await User.scope('withSecrets').findOne({ where: { email } });
  if (existing && existing.status !== 'invited') throw ApiError.conflict('An account with this email already exists');
  const address = await checkSlug(organizationSlug);
  if (!address.available) {
    const message = address.suggestion ? `${address.reason}. Try "${address.suggestion}".` : address.reason;
    throw ApiError.badRequest(message, [{ path: 'organizationSlug', message }]);
  }

  const passwordHash = await hashPassword(password);
  const user = existing
    ? await existing.update({ name, passwordHash, status: 'active', inviteToken: null })
    : await User.create({ name, email, passwordHash, avatarColor: pickAvatarColor(email) });
  await createOrganization(user, { name: organizationName, slug: address.slug });
  return buildSession(user);
}

export async function login({ email, password }) {
  const user = await User.scope('withSecrets').findOne({ where: { email } });
  const isValid = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!isValid) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active');
  return buildSession(user);
}

export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ where: { email, status: 'active' } });
  if (!user) return; // Never reveal whether an email is registered.
  const { raw, hash } = createOneTimeToken();
  await user.update({ resetToken: hash, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) });
  await sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name, token: raw }) });
}

export async function resetPassword({ token, password }) {
  const user = await User.scope('withSecrets').findOne({
    where: { resetToken: hashOneTimeToken(token), resetTokenExpiresAt: { [Op.gt]: new Date() } },
  });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  await user.update({ passwordHash: await hashPassword(password), resetToken: null, resetTokenExpiresAt: null });
  return buildSession(user);
}

export async function acceptInvite({ token, name, password }) {
  const user = await User.scope('withSecrets').findOne({
    where: { inviteToken: hashOneTimeToken(token), status: 'invited' },
  });
  if (!user) throw ApiError.badRequest('This invitation is invalid or was already accepted');
  await user.update({ name, passwordHash: await hashPassword(password), status: 'active', inviteToken: null });
  return buildSession(user);
}

export async function updateProfile(user, changes) {
  const { preferences, ...rest } = changes;
  const updates = { ...rest };
  if (preferences) updates.preferences = { ...user.preferences, ...preferences };
  await user.update(updates);
  return user.toJSON();
}

export async function changePassword(user, { currentPassword, newPassword }) {
  const withSecrets = await User.scope('withSecrets').findByPk(user.id);
  const isValid = await bcrypt.compare(currentPassword, withSecrets.passwordHash ?? '');
  if (!isValid) throw ApiError.badRequest('Current password is incorrect');
  await withSecrets.update({ passwordHash: await hashPassword(newPassword) });
}
