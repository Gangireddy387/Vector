import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Comment, Issue, Organization, OrganizationMember, Project, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { disconnectUser } from '../../shared/realtime/socket.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { accountReadyEmail, passwordResetEmail } from '../../shared/services/email-templates.js';
import {
  consumeRecoveryCode,
  createRecoveryCodes,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  verifyTotp,
} from './mfa.js';
import { createOneTimeToken, hashOneTimeToken, isMfaToken, isRevoked, signAccessToken, signMfaToken, verifyAccessToken } from './token.js';
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
  const org = membership?.organization ?? null;
  const mfaSetupRequired = Boolean(org?.requireMfa && !user.mfaEnabled);
  // passwordHash is scoped out of normal loads; OAuth accounts need this flag for Settings.
  const secret = await User.scope('withSecrets').findByPk(user.id, { attributes: ['passwordHash'] });
  const hasPassword = Boolean(secret?.passwordHash);
  return {
    user: {
      ...user.toJSON(),
      workspaceRole: membership?.role ?? 'member',
      isSuperAdmin: isSuperAdmin(user),
      mfaSetupRequired,
      hasPassword,
      authProviders: {
        password: hasPassword,
        google: Boolean(user.googleSubject),
        microsoft: Boolean(user.microsoftSubject),
      },
    },
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
  if (user.mfaEnabled && user.mfaSecret) {
    return { mfaRequired: true, mfaToken: signMfaToken(user) };
  }
  return buildSession(user);
}

async function loadMfaChallenge(mfaToken) {
  let payload;
  try {
    payload = verifyAccessToken(mfaToken);
  } catch {
    throw ApiError.unauthorized('This sign-in step expired. Enter your password again.');
  }
  if (!isMfaToken(payload)) throw ApiError.unauthorized('This sign-in step expired. Enter your password again.');
  const user = await User.scope('withSecrets').findByPk(payload.sub);
  if (!user || user.status !== 'active' || !user.mfaEnabled || !user.mfaSecret || isRevoked(payload, user)) {
    throw ApiError.unauthorized('This sign-in step expired. Enter your password again.');
  }
  return user;
}

/** Completes sign-in after password when MFA is on: authenticator code or a one-time recovery code. */
export async function verifyMfaLogin({ mfaToken, code, recoveryCode }) {
  const user = await loadMfaChallenge(mfaToken);
  if (recoveryCode) {
    const remaining = consumeRecoveryCode(user.mfaRecoveryCodes, recoveryCode);
    if (!remaining) throw ApiError.unauthorized('That recovery code is invalid or already used');
    await user.update({ mfaRecoveryCodes: remaining });
    return buildSession(user);
  }
  const secret = decryptSecret(user.mfaSecret);
  if (!code || !verifyTotp(secret, code)) throw ApiError.unauthorized('Incorrect authenticator code');
  return buildSession(user);
}

/** Starts MFA setup: returns a secret + otpauth URL once; confirm with a code before it is required on login. */
export async function setupMfa(actor) {
  const user = await User.scope('withSecrets').findByPk(actor.id);
  if (!user?.passwordHash) throw ApiError.badRequest('Set a password before turning on two-factor authentication');
  if (user.mfaEnabled) throw ApiError.badRequest('Two-factor authentication is already on. Turn it off first to set it up again.');
  const { secret, otpauthUrl } = createTotpSecret(user.email);
  await user.update({ mfaSecret: encryptSecret(secret), mfaRecoveryCodes: null, mfaEnabled: false });
  return { secret, otpauthUrl };
}

/** Confirms the authenticator app and enables MFA; returns recovery codes once. */
export async function confirmMfa(actor, { code }) {
  const user = await User.scope('withSecrets').findByPk(actor.id);
  if (!user?.mfaSecret) throw ApiError.badRequest('Start setup from Settings before confirming');
  if (user.mfaEnabled) throw ApiError.badRequest('Two-factor authentication is already on');
  const secret = decryptSecret(user.mfaSecret);
  if (!verifyTotp(secret, code)) throw ApiError.badRequest('Incorrect authenticator code', [{ path: 'code', message: 'Incorrect authenticator code' }]);
  const { codes, hashes } = createRecoveryCodes();
  await user.update({ mfaEnabled: true, mfaRecoveryCodes: hashes });
  return { recoveryCodes: codes, user: { ...user.toJSON(), mfaEnabled: true } };
}

/** Turns MFA off after password + a current authenticator or recovery code. */
export async function disableMfa(actor, { password, code, recoveryCode }) {
  const user = await User.scope('withSecrets').findByPk(actor.id);
  if (!user?.mfaEnabled) throw ApiError.badRequest('Two-factor authentication is not on');
  const enforced = await OrganizationMember.findOne({
    where: { userId: actor.id, status: 'active' },
    include: [{ model: Organization, as: 'organization', where: { requireMfa: true }, required: true }],
  });
  if (enforced) {
    throw ApiError.badRequest('Your organization requires two-factor authentication. Ask an admin to turn that off first.');
  }
  if (!(await bcrypt.compare(password, user.passwordHash ?? DUMMY_HASH))) {
    throw ApiError.unauthorized('Incorrect password');
  }
  if (recoveryCode) {
    const remaining = consumeRecoveryCode(user.mfaRecoveryCodes, recoveryCode);
    if (!remaining) throw ApiError.badRequest('That recovery code is invalid or already used', [{ path: 'recoveryCode', message: 'Invalid recovery code' }]);
  } else {
    const secret = decryptSecret(user.mfaSecret);
    if (!code || !verifyTotp(secret, code)) throw ApiError.badRequest('Incorrect authenticator code', [{ path: 'code', message: 'Incorrect authenticator code' }]);
  }
  await user.update({ mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null });
  return { user: { ...user.toJSON(), mfaEnabled: false } };
}

/** Replaces recovery codes (password + TOTP). Codes are shown once. */
export async function regenerateMfaRecovery(actor, { password, code }) {
  const user = await User.scope('withSecrets').findByPk(actor.id);
  if (!user?.mfaEnabled || !user.mfaSecret) throw ApiError.badRequest('Two-factor authentication is not on');
  if (!(await bcrypt.compare(password, user.passwordHash ?? DUMMY_HASH))) throw ApiError.unauthorized('Incorrect password');
  const secret = decryptSecret(user.mfaSecret);
  if (!verifyTotp(secret, code)) throw ApiError.badRequest('Incorrect authenticator code', [{ path: 'code', message: 'Incorrect authenticator code' }]);
  const { codes, hashes } = createRecoveryCodes();
  await user.update({ mfaRecoveryCodes: hashes });
  return { recoveryCodes: codes };
}

/** Sends a reset link only when an active account exists. Unknown and inactive emails get a specific error. */
export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ where: { email } });
  if (!user) throw ApiError.notFound('No account found for that email');
  if (user.status === 'invited') {
    throw ApiError.badRequest('This email has a pending invitation. Open the invitation link to set up your account.');
  }
  if (user.status !== 'active') throw ApiError.badRequest('This account is not active');
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
  await user.update({
    passwordHash: await hashPassword(password),
    resetToken: null,
    resetTokenExpiresAt: null,
    mustChangePassword: false,
    tokenVersion: (user.tokenVersion ?? 0) + 1,
  });
  return buildSession(user);
}

export async function acceptInvite({ token, name, password }) {
  const user = await User.scope('withSecrets').findOne({
    where: { inviteToken: hashOneTimeToken(token), status: 'invited' },
  });
  if (!user) throw ApiError.badRequest('This invitation is invalid or was already accepted');
  await user.update({ name, passwordHash: await hashPassword(password), status: 'active', inviteToken: null, mustChangePassword: false });
  return buildSession(user);
}

/** Easy to read out and type: no 0/O, 1/l/I. 12 characters ≈ 70 bits. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function temporaryPassword() {
  const characters = Array.from(crypto.randomBytes(12), (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
  return `${characters.slice(0, 4).join('')}-${characters.slice(4, 8).join('')}-${characters.slice(8).join('')}`;
}

/**
 * One-click invitation: clicking "Accept" in the email activates the account with a temporary password, which is
 * shown once and emailed, and signs the person in. They must choose their own password before they start.
 */
export async function acceptInviteQuick({ token }) {
  const user = await User.scope('withSecrets').findOne({ where: { inviteToken: hashOneTimeToken(token), status: 'invited' } });
  if (!user) throw ApiError.badRequest('This invitation is invalid or was already accepted. If you accepted it before, sign in with the password from your email.');
  const password = temporaryPassword();
  await user.update({ passwordHash: await hashPassword(password), status: 'active', inviteToken: null, mustChangePassword: true });
  const organization = user.lastOrganizationId ? await Organization.findByPk(user.lastOrganizationId, { attributes: ['id', 'name', 'slug', 'logoUrl'] }) : null;
  await sendEmail({ to: user.email, ...accountReadyEmail({ name: user.name, email: user.email, temporaryPassword: password, organization }) });
  return { ...(await buildSession(user)), temporaryPassword: password };
}

export async function updateProfile(user, changes) {
  const { preferences, ...rest } = changes;
  const updates = { ...rest };
  if (preferences) {
    updates.preferences = { ...user.preferences, ...preferences };
    if (preferences.sounds) updates.preferences.sounds = { ...user.preferences?.sounds, ...preferences.sounds };
    if (preferences.favoriteProjectIds) {
      updates.preferences.favoriteProjectIds = {
        ...(user.preferences?.favoriteProjectIds ?? {}),
        ...preferences.favoriteProjectIds,
      };
    }
  }
  await user.update(updates);
  return user.toJSON();
}

/** Signs out every other session; returns a new token for this one. */
/**
 * Changes or sets the password (other devices are signed out).
 * - Temporary invite password: no current password; must pick a different one.
 * - OAuth-only (no password yet): no current password — this is “set a password”.
 * - Normal accounts: current password required.
 */
export async function changePassword(user, { currentPassword, newPassword }) {
  const withSecrets = await User.scope('withSecrets').findByPk(user.id);
  if (withSecrets.mustChangePassword) {
    if (await bcrypt.compare(newPassword, withSecrets.passwordHash ?? DUMMY_HASH)) {
      throw ApiError.badRequest('Choose a password different from the temporary one', [
        { path: 'newPassword', message: 'Choose a password different from the temporary one' },
      ]);
    }
  } else if (!withSecrets.passwordHash) {
    // Google / Microsoft sign-in with no local password yet.
  } else {
    const isValid = await bcrypt.compare(currentPassword ?? '', withSecrets.passwordHash ?? DUMMY_HASH);
    if (!isValid) throw ApiError.badRequest('Current password is incorrect');
  }
  await withSecrets.update({
    passwordHash: await hashPassword(newPassword),
    mustChangePassword: false,
    tokenVersion: (withSecrets.tokenVersion ?? 0) + 1,
  });
  return { token: signAccessToken(withSecrets) };
}

/** Signs out every other browser/session; this request continues with a fresh access token. */
export async function revokeOtherSessions(user) {
  const withSecrets = await User.scope('withSecrets').findByPk(user.id);
  await withSecrets.update({ tokenVersion: (withSecrets.tokenVersion ?? 0) + 1 });
  return { token: signAccessToken(withSecrets) };
}

/**
 * JSON export of the signed-in person's profile, memberships, preferences, assigned/reported/watched issues, and comment count.
 */
export async function exportAccount(user) {
  const memberships = await OrganizationMember.findAll({
    where: { userId: user.id },
    include: [{ model: Organization, as: 'organization', attributes: ['id', 'name', 'slug', 'status'] }],
  });
  const issueAttrs = ['key', 'title', 'projectId', 'updatedAt'];
  const issueInclude = [{ model: Project, as: 'project', attributes: ['key', 'name'] }];
  const mapIssue = (issue) => ({
    key: issue.key,
    title: issue.title,
    projectKey: issue.project?.key ?? null,
    projectName: issue.project?.name ?? null,
    updatedAt: issue.updatedAt,
  });
  const [assigned, reported, watched, commentsAuthored] = await Promise.all([
    Issue.findAll({
      where: { assigneeId: user.id },
      attributes: issueAttrs,
      include: issueInclude,
      order: [['updatedAt', 'DESC']],
      limit: 2000,
    }),
    Issue.findAll({
      where: { reporterId: user.id },
      attributes: issueAttrs,
      include: issueInclude,
      order: [['updatedAt', 'DESC']],
      limit: 2000,
    }),
    user.getWatchedIssues({
      attributes: issueAttrs,
      include: issueInclude,
      order: [['updatedAt', 'DESC']],
      limit: 2000,
      joinTableAttributes: [],
    }),
    Comment.count({ where: { authorId: user.id } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      timezone: user.timezone,
      about: user.about,
      location: user.location,
      phone: user.phone,
      skills: user.skills ?? [],
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      mfaEnabled: Boolean(user.mfaEnabled),
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    },
    preferences: user.preferences ?? {},
    memberships: memberships.map((membership) => ({
      organizationId: membership.organizationId,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt,
      organization: membership.organization
        ? {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            status: membership.organization.status,
          }
        : null,
    })),
    assignedIssues: assigned.map(mapIssue),
    reportedIssues: reported.map(mapIssue),
    watchedIssues: watched.map(mapIssue),
    commentsAuthored,
  };
}

/**
 * Soft-deletes the account: disables it, anonymizes the email, and invalidates all sessions.
 * Password accounts confirm with their password; OAuth-only accounts type their email instead.
 * The portal super-admin email cannot be deleted this way.
 */
export async function deleteAccount(user, { password, confirmEmail } = {}) {
  if (config.superAdmin.email && user.email?.toLowerCase() === config.superAdmin.email) {
    throw ApiError.badRequest('The portal owner account cannot be deleted this way');
  }
  const withSecrets = await User.scope('withSecrets').findByPk(user.id);
  if (withSecrets?.passwordHash) {
    const isValid = await bcrypt.compare(password ?? '', withSecrets.passwordHash ?? DUMMY_HASH);
    if (!isValid) {
      throw ApiError.badRequest('Password is incorrect', [{ path: 'password', message: 'Password is incorrect' }]);
    }
  } else {
    const typed = String(confirmEmail ?? '')
      .trim()
      .toLowerCase();
    if (!typed || typed !== String(user.email ?? '').toLowerCase()) {
      throw ApiError.badRequest('Type your account email to confirm', [
        { path: 'confirmEmail', message: 'Type your account email to confirm' },
      ]);
    }
  }

  const stamp = Date.now().toString(36);
  const anonymizedEmail = `deleted+${user.id.slice(0, 8)}.${stamp}@deleted.invalid`;
  await withSecrets.update({
    status: 'disabled',
    name: 'Deleted user',
    email: anonymizedEmail,
    title: null,
    about: null,
    location: null,
    phone: null,
    skills: [],
    avatarUrl: null,
    inviteToken: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    googleSubject: null,
    microsoftSubject: null,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
    mustChangePassword: false,
    tokenVersion: (withSecrets.tokenVersion ?? 0) + 1,
    preferences: { emailNotifications: false, dailyDigest: false, weeklyReportsEmail: false, autoTimezone: true },
  });
  disconnectUser(user.id);
  return { deleted: true };
}
