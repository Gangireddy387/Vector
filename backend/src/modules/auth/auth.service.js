import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { passwordResetEmail } from '../../shared/services/email-templates.js';
import { createOneTimeToken, hashOneTimeToken, signAccessToken } from './token.js';
import { listMyOrganizations, resolveOrganization, toPublicOrganization } from '../organizations/index.js';
import { checkSlug, createOrganization } from '../organizations/organization.service.js';
import { isSuperAdmin } from '../super-admin/super-admin.service.js';
import { pickAvatarColor } from '../users/user.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_HASH_ROUNDS = 12;
export const hashPassword = (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
/** Compared against when the email is unknown, so a wrong email takes as long as a wrong password. */
const DUMMY_HASH = bcrypt.hashSync('vector-timing-equalizer', PASSWORD_HASH_ROUNDS);

/**
 * What the app needs about the signed-in person: their profile (with `workspaceRole` meaning their role in the
 * current organization), the current organization and every organization they can switch to.
 */
export async function describeSession(user, membership, memberships) {
  return {
    user: { ...user.toJSON(), workspaceRole: membership?.role ?? 'member', isSuperAdmin: isSuperAdmin(user) },
    organization: membership ? { ...toPublicOrganization(membership.organization), role: membership.role } : null,
    organizations: await listMyOrganizations(memberships),
  };
}

const buildSession = async (user) => {
  await user.update({ lastSeenAt: new Date() });
  const { membership, memberships } = await resolveOrganization(user, user.lastOrganizationId);
  return { token: signAccessToken(user), ...(await describeSession(user, membership, memberships)) };
};

/**
 * Signing up creates the person's account and their organization, which they administer. An email with a pending
 * invitation can only be claimed through the invitation link (it proves the person owns the mailbox), and the portal
 * owner's email is reserved for the account created from the server's configuration.
 */
export async function register({ name, email, password, organizationName, organizationSlug }) {
  if (config.superAdmin.email && email.toLowerCase() === config.superAdmin.email) throw ApiError.conflict('An account with this email already exists');
  const existing = await User.findOne({ where: { email } });
  if (existing?.status === 'invited') {
    throw new ApiError(409, 'You were invited to Vector. Open the invitation link in your email to set up your account.', { code: 'invitation_pending' });
  }
  if (existing) throw ApiError.conflict('An account with this email already exists');
  const address = await checkSlug(organizationSlug);
  if (!address.available) {
    const message = address.suggestion ? `${address.reason}. Try "${address.suggestion}".` : address.reason;
    throw ApiError.badRequest(message, [{ path: 'organizationSlug', message }]);
  }

  const user = await User.create({ name, email, passwordHash: await hashPassword(password), avatarColor: pickAvatarColor(email) });
  await createOrganization(user, { name: organizationName, slug: address.slug });
  return buildSession(user);
}

export async function login({ email, password }) {
  const user = await User.scope('withSecrets').findOne({ where: { email } });
  const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !isValid) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active');
  // Passwords saved with a weaker setting are strengthened the next time they are used.
  if (bcrypt.getRounds(user.passwordHash) < PASSWORD_HASH_ROUNDS) await user.update({ passwordHash: await hashPassword(password) });
  return buildSession(user);
}

/** Answers the same way, and as fast, whether or not the email is registered; the email goes out in the background. */
export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ where: { email, status: 'active' } });
  if (!user) return;
  const { raw, hash } = createOneTimeToken();
  await user.update({ resetToken: hash, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) });
  void sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name, token: raw }) }).catch((error) =>
    console.error('[auth] could not send a password reset email:', error.message),
  );
}

/** A new password signs out every other session (older tokens stop working). */
export async function resetPassword({ token, password }) {
  const user = await User.scope('withSecrets').findOne({
    where: { resetToken: hashOneTimeToken(token), resetTokenExpiresAt: { [Op.gt]: new Date() } },
  });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  await user.update({ passwordHash: await hashPassword(password), resetToken: null, resetTokenExpiresAt: null, tokenVersion: (user.tokenVersion ?? 0) + 1 });
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

/** Signs out every other session; returns a new token for this one. */
export async function changePassword(user, { currentPassword, newPassword }) {
  const withSecrets = await User.scope('withSecrets').findByPk(user.id);
  const isValid = await bcrypt.compare(currentPassword, withSecrets.passwordHash ?? DUMMY_HASH);
  if (!withSecrets.passwordHash || !isValid) throw ApiError.badRequest('Current password is incorrect');
  await withSecrets.update({ passwordHash: await hashPassword(newPassword), tokenVersion: (withSecrets.tokenVersion ?? 0) + 1 });
  return { token: signAccessToken(withSecrets) };
}
