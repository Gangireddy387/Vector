import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import {
  Attachment,
  CalendarEvent,
  Conversation,
  Department,
  Issue,
  IssueWatcher,
  Meeting,
  MeetingFile,
  MeetingRecording,
  Organization,
  OrganizationMember,
  OrganizationRole,
  Project,
  ProjectMember,
  sequelize,
  SupportMessage,
  User,
} from '../../database/models.js';
import { writeTransaction } from '../../database/connection.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { disconnectUser, emitToUser, revokeRealtimeAccess } from '../../shared/realtime/socket.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';
import { forgetBoard } from '../meetings/meeting.collab.js';
import { releaseDialIn } from '../meetings/meeting.phone.js';
import { closeCall } from '../meetings/meeting.signaling.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { addedToOrganizationEmail, inviteLinkFor, organizationInviteEmail, organizationReviewRequestEmail, planUpgradeRequestEmail } from '../../shared/services/email-templates.js';
import { createImageStore } from '../../shared/services/image-store.js';
import { slugify } from '../../shared/utils/ids.js';
import { removeFromStructure } from '../departments/department.service.js';
import { assertWithinLimit, entitlementsFor, getDefaultPlan, usageFor, withPlan } from '../plans/plan.service.js';
import { createOneTimeToken } from '../auth/token.js';
import { getWorkdayNudgeStats } from '../notifications/nudge-metrics.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { sendMessage, superAdminIds } from '../support/support.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { pickAvatarColor } from '../users/user.service.js';
import { logWorkspaceAction } from '../workspace/workspace-audit.service.js';
import { normalizeRetention, publicRetention } from './data-retention.service.js';
import { normalizeAiGrounding, publicAiGrounding } from '../ai/ai.grounding.js';
import { normalizeCapacity, publicCapacity } from './capacity.service.js';
import { assertInviteEmailAllowed, normalizeInvitePolicy, publicInvitePolicy } from './invite-policy.service.js';
import {
  channelNotifySettingsFor,
  cleanChannelNotifyInput,
  publicChannelNotifications,
} from '../integrations/organization-channel-notify.js';
import { cleanSsoInput, publicSso, ssoSettingsFor } from './organization-sso.js';
import { customRolesEnabled, resolveMembershipPermissions } from './organization-role.service.js';

/** What an org admin can request from the portal. */
export const UPGRADE_TARGETS = ['pro', 'enterprise', 'seats', 'projects'];
const UPGRADE_LABELS = { pro: 'Pro', enterprise: 'Enterprise', seats: 'more people', projects: 'more projects' };

/** Organization addresses sit right after the domain (example.com/acme), so they must never shadow an app page or look official. */
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'account', 'accounts', 'login', 'logout', 'register', 'signup', 'signin', 'settings', 'projects',
  'issues', 'reports', 'search', 'inbox', 'notifications', 'organizations', 'organization', 'new', 'help', 'support', 'docs',
  'privacy', 'terms', 'legal', 'status', 'billing', 'vector', 'www', 'mail', 'static', 'assets', 'public', 'root', 'system',
  'accept-invite', 'forgot-password', 'reset-password', 'more', 'home', 'dashboard', 'invite', 'join', 'me', 'user', 'users',
  'board', 'backlog', 'chat', 'standup', 'progress', 'automation', 'team', 'teams', 'workspace', 'about', 'pricing', 'blog',
  'support-call', 'super-admin', 'superadmin', 'join', 'meetings', 'calendar', 'messages', 'departments',
  'super-admin', 'superadmin', 'pending-approval', 'calendar', 'messages', 'meetings',
  'workday', 'preview',
]);
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export { slugify };

export const toPublicOrganization = (organization) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  defaultMode: organization.defaultMode,
  logoUrl: organization.logoUrl ?? null,
  brandColor: organization.brandColor ?? null,
  requireMfa: Boolean(organization.requireMfa),
  sso: ssoSettingsFor(organization),
  channelNotifications: channelNotifySettingsFor(organization),
  retention: publicRetention(organization),
  invitePolicy: publicInvitePolicy(organization),
  capacity: publicCapacity(organization),
  aiGrounding: publicAiGrounding(organization),
  status: organization.status ?? 'approved',
  rejectionReason: organization.status === 'rejected' ? (organization.rejectionReason ?? null) : null,
  // Only when the plan was loaded; otherwise clients keep the entitlements they already have.
  ...(organization.plan !== undefined ? { entitlements: entitlementsFor(organization) } : {}),
  updatedAt: organization.updatedAt,
});

const logos = createImageStore({ folder: 'organization-logos', urlPrefix: '/api/organization-logos/', field: 'logo' });
export const logoUpload = logos.upload;
export const resolveLogoFile = logos.resolve;

async function isSlugTaken(slug, exceptId) {
  const where = { slug };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  return Boolean(await Organization.count({ where }));
}

/** Whether an address can be used, and a free alternative when it cannot. */
export async function checkSlug(rawSlug, exceptId) {
  const slug = slugify(rawSlug);
  let reason = null;
  if (!SLUG_PATTERN.test(slug)) reason = 'Use 3–40 lowercase letters, numbers or hyphens';
  else if (RESERVED_SLUGS.has(slug)) reason = 'This address is reserved';
  else if (await isSlugTaken(slug, exceptId)) reason = 'This address is already taken';
  if (!reason) return { slug, available: true, suggestion: slug, reason: null };

  const base = SLUG_PATTERN.test(slug) ? slug.slice(0, 34) : 'team';
  let suggestion = null;
  for (let attempt = 2; attempt < 60 && !suggestion; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!RESERVED_SLUGS.has(candidate) && !(await isSlugTaken(candidate))) suggestion = candidate;
  }
  return { slug, available: false, suggestion, reason };
}

async function assertSlugAvailable(slug, exceptId) {
  const result = await checkSlug(slug, exceptId);
  if (!result.available) {
    const message = result.suggestion ? `${result.reason}. Try "${result.suggestion}".` : result.reason;
    throw ApiError.badRequest(message, [{ path: 'organizationSlug', message }, { path: 'slug', message }]);
  }
  return result.slug;
}

/**
 * Keeps the super admin's open tabs current without reloading: a new signup waiting for approval, a rename or a
 * status change, or an organization removed. `action`: created, updated or deleted.
 */
export async function notifyPortal(action, organization) {
  if (!config.superAdmin.email) return;
  const admins = await User.findAll({ where: { email: config.superAdmin.email }, attributes: ['id'], raw: true });
  const payload = { action, organization: { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status } };
  admins.forEach((admin) => emitToUser(admin.id, 'portal:organization', payload));
}

export async function createOrganization(user, { name, slug }) {
  const address = await assertSlugAvailable(slug || name);
  const needsApproval = Boolean(config.superAdmin.email);
  const defaultPlan = await getDefaultPlan();
  const organization = await Organization.create({
    name: name.trim(),
    slug: address,
    status: needsApproval ? 'pending' : 'approved',
    planId: defaultPlan?.id ?? null,
    createdById: user.id,
    updatedById: user.id,
  });
  await OrganizationMember.create({ organizationId: organization.id, userId: user.id, role: 'admin' });
  await user.update({ lastOrganizationId: organization.id });
  if (needsApproval) await sendEmail({ to: config.superAdmin.email, ...organizationReviewRequestEmail({ organization, creator: user }) });
  await notifyPortal('created', organization);
  return organization;
}

/** The organizations a person belongs to, with their role and a few counts for the switcher. */
export async function listMyOrganizations(memberships) {
  const ids = memberships.map((membership) => membership.organizationId);
  if (!ids.length) return [];
  const [people, projects] = await Promise.all([
    OrganizationMember.findAll({ where: { organizationId: ids, status: 'active' }, attributes: ['organizationId'], raw: true }),
    Project.findAll({ where: { organizationId: ids, archivedAt: null }, attributes: ['organizationId'], raw: true }),
  ]);
  return Promise.all(
    memberships.map(async (membership) => ({
      ...toPublicOrganization(membership.organization),
      role: membership.role,
      customRoleId: membership.role === 'admin' ? null : membership.customRoleId ?? null,
      permissions: await resolveMembershipPermissions(membership, membership.organization),
      memberCount: people.filter((row) => row.organizationId === membership.organizationId).length,
      projectCount: projects.filter((row) => row.organizationId === membership.organizationId).length,
    })),
  );
}

export async function switchOrganization(user, memberships, organizationId) {
  const membership = memberships.find((item) => item.organizationId === organizationId);
  if (!membership) throw ApiError.notFound('Organization not found');
  await user.update({ lastOrganizationId: organizationId });
  return membership;
}

export async function getPublicOrganization(slug) {
  const organization = await Organization.findOne({ where: { slug: slugify(slug) }, include: withPlan() });
  if (!organization) throw ApiError.notFound('Organization not found');
  const sso = publicSso(organization, { includeTenant: true, includeOidc: true });
  const available = Boolean(entitlementsFor(organization).features.sso && sso.enabled);
  return {
    name: organization.name,
    slug: organization.slug,
    defaultMode: organization.defaultMode,
    brandColor: organization.brandColor ?? null,
    logoUrl: organization.logoUrl ?? null,
    sso: available
      ? {
          enabled: true,
          enforce: sso.enforce,
          provider: sso.provider,
          allowedDomains: sso.allowedDomains,
          microsoftTenant: sso.microsoftTenant,
          ...(sso.provider === 'oidc' && sso.oidc
            ? { oidc: { issuer: sso.oidc.issuer, clientId: sso.oidc.clientId, scopes: sso.oidc.scopes, clientSecretConfigured: sso.oidc.clientSecretConfigured } }
            : {}),
        }
      : { enabled: false, enforce: false, provider: null, allowedDomains: [], microsoftTenant: null },
  };
}

// --- Settings & people of the current organization ---------------------------

export async function updateOrganization(organization, actor, changes) {
  const updates = { ...changes, updatedById: actor.id };
  if (changes.slug !== undefined) updates.slug = await assertSlugAvailable(changes.slug, organization.id);
  if (changes.name !== undefined) updates.name = changes.name.trim();
  if (changes.sso !== undefined || changes.channelNotifications !== undefined) {
    // Plan must be loaded for SSO / channel notification feature checks.
    const withFeatures =
      organization.plan !== undefined
        ? organization
        : await Organization.findByPk(organization.id, { include: withPlan() });
    if (changes.sso !== undefined) updates.sso = cleanSsoInput(changes.sso, withFeatures);
    if (changes.channelNotifications !== undefined) {
      updates.channelNotifications = cleanChannelNotifyInput(changes.channelNotifications, withFeatures);
    }
  }
  if (changes.retention !== undefined) {
    updates.retention = normalizeRetention({ ...(organization.retention ?? {}), ...changes.retention });
  }
  if (changes.invitePolicy !== undefined) {
    updates.invitePolicy = normalizeInvitePolicy({ ...(organization.invitePolicy ?? {}), ...changes.invitePolicy });
  }
  if (changes.capacity !== undefined) {
    updates.capacity = normalizeCapacity({ ...(organization.capacity ?? {}), ...changes.capacity });
  }
  if (changes.aiGrounding !== undefined) {
    updates.aiGrounding = normalizeAiGrounding({ ...(organization.aiGrounding ?? {}), ...changes.aiGrounding });
  }
  const before = {
    name: organization.name,
    slug: organization.slug,
    defaultMode: organization.defaultMode,
    brandColor: organization.brandColor ?? null,
    requireMfa: Boolean(organization.requireMfa),
    sso: publicSso(organization, { includeTenant: true, includeOidc: true }),
    channelNotifications: publicChannelNotifications(organization),
    retention: publicRetention(organization),
    invitePolicy: publicInvitePolicy(organization),
    capacity: publicCapacity(organization),
    aiGrounding: publicAiGrounding(organization),
  };
  await organization.update(updates);
  const changed = Object.keys(changes).filter((key) =>
    ['name', 'slug', 'defaultMode', 'brandColor', 'requireMfa', 'sso', 'channelNotifications', 'retention', 'invitePolicy', 'capacity', 'aiGrounding'].includes(key),
  );
  if (changed.length) {
    await logWorkspaceAction({
      organizationId: organization.id,
      actorId: actor.id,
      action: 'settings.updated',
      targetType: 'organization',
      targetId: organization.id,
      meta: {
        fields: changed,
        before,
        after: {
          name: organization.name,
          slug: organization.slug,
          defaultMode: organization.defaultMode,
          brandColor: organization.brandColor ?? null,
          requireMfa: Boolean(organization.requireMfa),
          sso: publicSso(organization, { includeTenant: true, includeOidc: true }),
          channelNotifications: publicChannelNotifications(organization),
          retention: publicRetention(organization),
          invitePolicy: publicInvitePolicy(organization),
          capacity: publicCapacity(organization),
          aiGrounding: publicAiGrounding(organization),
        },
      },
    });
  }
  return broadcastOrganization(organization);
}

/** Pending upgrade request shape returned to clients (or null). */
export function publicUpgradeRequest(organization) {
  const request = organization.upgradeRequest;
  if (!request || request.status !== 'pending') return null;
  return {
    target: request.target,
    note: request.note ?? null,
    requestedByName: request.requestedByName ?? null,
    createdAt: request.createdAt,
    status: 'pending',
  };
}

/** The current organization's plan and how much of it is used, for its settings page. */
export async function getPlanOverview(organization) {
  return {
    entitlements: entitlementsFor(organization),
    usage: await usageFor(organization.id),
    upgradeRequest: publicUpgradeRequest(organization),
  };
}

/** Retention ops: day-2 / day-7 workday nudge send vs open (readAt). */
export const getWorkdayNudgeMetrics = (organizationId) => getWorkdayNudgeStats(organizationId);

/**
 * Org admin requests Pro / more seats / more projects. Posts to Vector support, emails the portal,
 * and stores a pending flag the super admin sees until they change the plan.
 */
export async function requestPlanUpgrade(organization, actor, { target, note } = {}) {
  if (!UPGRADE_TARGETS.includes(target)) throw ApiError.badRequest('Choose what you need: Pro, Enterprise, more people, or more projects');
  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const existing = publicUpgradeRequest(organization);
  if (existing && existing.target === target) {
    return { upgradeRequest: existing, alreadyPending: true };
  }

  const upgradeRequest = {
    target,
    note: trimmedNote || null,
    requestedById: actor.id,
    requestedByName: actor.name,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await organization.update({ upgradeRequest });

  const label = UPGRADE_LABELS[target] ?? target;
  const body = [
    `Plan request: ${actor.name} asked for ${label} for ${organization.name}.`,
    trimmedNote ? `Note: ${trimmedNote}` : null,
    'Fulfill this in Super Admin by changing their plan (that clears the request).',
  ]
    .filter(Boolean)
    .join('\n\n');

  await sendMessage(organization.id, actor, 'organization', body).catch((error) =>
    console.warn(`[plan] upgrade support message failed:`, error.message),
  );

  const portalIds = await superAdminIds();
  if (portalIds.length) {
    await notifyUsers({
      userIds: portalIds,
      actorId: actor.id,
      type: 'plan_upgrade_request',
      title: `${organization.name} requested ${label}`,
      body: trimmedNote || `${actor.name} asked the portal to upgrade.`,
      link: '/super-admin',
      email: false,
    });
  }
  if (config.superAdmin.email) {
    await sendEmail({
      to: config.superAdmin.email,
      ...planUpgradeRequestEmail({
        organization,
        requester: actor,
        targetLabel: label,
        note: trimmedNote || null,
      }),
    }).catch((error) => console.warn(`[plan] upgrade email failed:`, error.message));
  }

  await notifyPortal('updated', organization);
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'plan.upgrade_requested',
    targetType: 'organization',
    targetId: organization.id,
    meta: { target, note: trimmedNote || null },
  });
  return { upgradeRequest: publicUpgradeRequest(organization), alreadyPending: false };
}

/** Pushes the organization's current settings and status to every member's open browsers. */
export async function broadcastOrganization(organization) {
  const result = toPublicOrganization(organization);
  const members = await OrganizationMember.findAll({ where: { organizationId: organization.id, status: 'active' }, attributes: ['userId'], raw: true });
  members.forEach((member) => emitToUser(member.userId, 'workspace:updated', result));
  await notifyPortal('updated', organization);
  return result;
}

export async function setLogo(organization, actor, file) {
  const logoUrl = await logos.save(file);
  const previous = organization.logoUrl;
  await organization.update({ logoUrl, updatedById: actor.id });
  await logos.remove(previous);
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'settings.logo_updated',
    targetType: 'organization',
    targetId: organization.id,
  });
  return broadcastOrganization(organization);
}

export async function clearLogo(organization, actor) {
  const previous = organization.logoUrl;
  await organization.update({ logoUrl: null, updatedById: actor.id });
  await logos.remove(previous);
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'settings.logo_removed',
    targetType: 'organization',
    targetId: organization.id,
  });
  return broadcastOrganization(organization);
}

export async function listMembers(organizationId) {
  const memberships = await OrganizationMember.findAll({
    where: { organizationId },
    include: [
      { model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status', 'lastSeenAt', 'createdAt'] },
      { model: OrganizationRole, as: 'customRole', attributes: ['id', 'name', 'key'] },
    ],
  });
  const projectIds = (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
  const projectMemberships = projectIds.length ? await ProjectMember.findAll({ where: { projectId: projectIds }, attributes: ['userId'], raw: true }) : [];
  return memberships
    .filter((membership) => membership.user)
    .map((membership) => {
      const user = membership.user.toJSON();
      const customRole = membership.role === 'member' && membership.customRole ? membership.customRole.toJSON() : null;
      return {
        ...user,
        // An invited account that has not been accepted yet shows as invited; otherwise the organization-level status applies.
        status: user.status === 'invited' ? 'invited' : membership.status,
        workspaceRole: membership.role,
        customRoleId: customRole?.id ?? null,
        customRole,
        joinedAt: membership.createdAt,
        projectCount: projectMemberships.filter((row) => row.userId === user.id).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadMembership(organizationId, userId) {
  const membership = await OrganizationMember.findOne({ where: { organizationId, userId }, include: [{ model: User, as: 'user' }] });
  if (!membership) throw ApiError.notFound('This person is not in the organization');
  return membership;
}

async function assertAnotherAdmin(organizationId, userId) {
  const others = await OrganizationMember.count({ where: { organizationId, role: 'admin', status: 'active', userId: { [Op.ne]: userId } } });
  if (!others) throw ApiError.badRequest('The organization needs at least one active admin');
}

async function assertCustomRole(organizationId, customRoleId) {
  if (!customRoleId) return null;
  const role = await OrganizationRole.findOne({ where: { id: customRoleId, organizationId } });
  if (!role) throw ApiError.badRequest('Custom role not found in this organization');
  return role;
}

export async function updateMember(organizationId, actor, userId, { workspaceRole, status, customRoleId }) {
  if (userId === actor.id) throw ApiError.badRequest('You cannot change your own role or status');
  const membership = await loadMembership(organizationId, userId);
  const losesAdmin = membership.role === 'admin' && (workspaceRole === 'member' || status === 'disabled');
  if (losesAdmin) await assertAnotherAdmin(organizationId, userId);
  if (status && membership.user.status === 'invited') throw ApiError.badRequest('Invited people become active when they accept');
  if (status === 'active' && membership.status === 'disabled') await assertWithinLimit(organizationId, 'members');

  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  const nextRole = workspaceRole ?? membership.role;
  const updates = {
    ...(workspaceRole ? { role: workspaceRole } : {}),
    ...(status ? { status } : {}),
  };

  if (nextRole === 'admin') {
    updates.customRoleId = null;
  } else if (customRoleId !== undefined) {
    if (customRoleId && !customRolesEnabled(organization)) {
      throw ApiError.forbidden('The current plan does not include custom roles');
    }
    await assertCustomRole(organizationId, customRoleId);
    updates.customRoleId = customRoleId;
  }

  const previous = { role: membership.role, status: membership.status, customRoleId: membership.customRoleId };
  await membership.update(updates);
  // A deactivated member keeps their project memberships (for when they come back) but loses access at once.
  if (status === 'disabled') revokeRealtimeAccess(userId, { organizationId, projectIds: await projectIdsOf(organizationId) });
  if (workspaceRole && workspaceRole !== previous.role) {
    await logWorkspaceAction({
      organizationId,
      actorId: actor.id,
      action: 'member.role_changed',
      targetType: 'user',
      targetId: userId,
      meta: { email: membership.user.email, from: previous.role, to: workspaceRole },
    });
  }
  if (customRoleId !== undefined && customRoleId !== previous.customRoleId) {
    await logWorkspaceAction({
      organizationId,
      actorId: actor.id,
      action: 'member.custom_role_changed',
      targetType: 'user',
      targetId: userId,
      meta: { email: membership.user.email, from: previous.customRoleId, to: customRoleId },
    });
  }
  if (status && status !== previous.status) {
    await logWorkspaceAction({
      organizationId,
      actorId: actor.id,
      action: status === 'disabled' ? 'member.deactivated' : 'member.reactivated',
      targetType: 'user',
      targetId: userId,
      meta: { email: membership.user.email, from: previous.status, to: status },
    });
  }
  return (await listMembers(organizationId)).find((member) => member.id === userId);
}

const projectIdsOf = async (organizationId) => (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);

/** Removes someone from the organization and from every project in it; their work becomes unassigned. */
export async function removeMember(organizationId, actor, userId) {
  if (userId === actor.id) throw ApiError.badRequest('You cannot remove yourself. Ask another admin.');
  const membership = await loadMembership(organizationId, userId);
  if (membership.role === 'admin') await assertAnotherAdmin(organizationId, userId);
  const projectIds = await projectIdsOf(organizationId);
  await writeTransaction(async (transaction) => {
    if (projectIds.length) {
      await ProjectMember.destroy({ where: { projectId: projectIds, userId }, transaction });
      await Issue.update({ assigneeId: null }, { where: { projectId: projectIds, assigneeId: userId }, transaction });
      // They no longer follow work they cannot see.
      await IssueWatcher.destroy({ where: { userId, issueId: { [Op.in]: sequelize.literal(`(SELECT id FROM issues WHERE project_id IN (${projectIds.map((id) => sequelize.escape(id)).join(',')}))`) } }, transaction });
    }
    await membership.destroy({ transaction });
    if (membership.user.lastOrganizationId === organizationId) await membership.user.update({ lastOrganizationId: null }, { transaction });
  });
  await removeFromStructure(organizationId, userId);
  revokeRealtimeAccess(userId, { organizationId, projectIds });
  await logWorkspaceAction({
    organizationId,
    actorId: actor.id,
    action: 'member.removed',
    targetType: 'user',
    targetId: userId,
    meta: { email: membership.user.email, role: membership.role },
  });
}

/** Deletes the organization with all of its projects and work. People keep their accounts and other organizations. */
export async function deleteOrganization(organization, { confirmName }) {
  if (confirmName.trim() !== organization.name) throw ApiError.badRequest('Type the organization name exactly to confirm', [{ path: 'confirmName', message: 'The name does not match' }]);
  await purgeOrganization(organization);
}

/**
 * Removes an organization and everything in it: projects and their work, meetings (calls end, dial-in PINs stop),
 * chats, calendars, structure, support messages, memberships, and their files on disk. Members' open tabs are told
 * at once. With `removeAccounts`, people who belonged to no other organization lose their account too (the email can
 * sign up again); the portal's super admin never does. Returns how many accounts were removed.
 */
export async function purgeOrganization(organization, { removeAccounts = false } = {}) {
  const organizationId = organization.id;
  const [projectIds, meetings, memberIds] = await Promise.all([
    Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true }).then((rows) => rows.map((row) => row.id)),
    Meeting.findAll({ where: { organizationId }, attributes: ['id', 'status', 'sipRuleId'] }),
    OrganizationMember.findAll({ where: { organizationId }, attributes: ['userId'], raw: true }).then((rows) => rows.map((row) => row.userId)),
  ]);
  const meetingIds = meetings.map((meeting) => meeting.id);

  // Files on disk, found before their rows go.
  const [attachments, recordings, meetingFiles] = await Promise.all([
    projectIds.length ? Attachment.findAll({ include: [{ model: Issue, as: 'issue', attributes: [], where: { projectId: projectIds } }], attributes: ['storageKey'], raw: true }) : [],
    meetingIds.length ? MeetingRecording.findAll({ where: { meetingId: meetingIds }, attributes: ['storageKey'], raw: true }) : [],
    meetingIds.length ? MeetingFile.findAll({ where: { meetingId: meetingIds }, attributes: ['storageKey'], raw: true }) : [],
  ]);

  for (const meeting of meetings) {
    if (meeting.status === 'live') await closeCall(meeting.id, 'cancelled').catch(() => undefined);
    await forgetBoard(meeting.id).catch(() => undefined);
    await releaseDialIn(meeting).catch(() => undefined);
  }

  await writeTransaction(async (transaction) => {
    const where = { organizationId };
    await Meeting.destroy({ where, transaction });
    await Conversation.destroy({ where, transaction });
    await CalendarEvent.destroy({ where, transaction });
    await SupportMessage.destroy({ where, transaction });
    await Project.destroy({ where, transaction });
    await Department.destroy({ where, transaction });
    await OrganizationMember.destroy({ where, transaction });
    await User.update({ lastOrganizationId: null }, { where: { lastOrganizationId: organizationId }, transaction });
    await Organization.destroy({ where: { id: organizationId }, transaction });
  });

  await Promise.all(
    [...attachments, ...recordings, ...meetingFiles]
      .map((file) => file.storageKey)
      .filter(Boolean)
      .map((storageKey) => deleteStoredFile(storageKey).catch(() => undefined)),
  );
  await logos.remove(organization.logoUrl).catch(() => undefined);

  for (const userId of memberIds) {
    emitToUser(userId, 'workspace:removed', { id: organizationId });
    revokeRealtimeAccess(userId, { organizationId, projectIds });
  }
  await notifyPortal('deleted', organization);

  if (!removeAccounts) return 0;
  let removed = 0;
  for (const userId of memberIds) {
    if (await OrganizationMember.count({ where: { userId } })) continue;
    const user = await User.findByPk(userId);
    if (!user || (config.superAdmin.email && user.email?.toLowerCase() === config.superAdmin.email)) continue;
    try {
      await user.destroy();
      disconnectUser(userId);
      removed += 1;
    } catch (error) {
      // Something elsewhere still refers to them (e.g. work in an organization they left): keep the account.
      console.warn(`[organizations] kept the account of ${userId}:`, error.message);
    }
  }
  return removed;
}

/**
 * A new invitation link for someone who has not accepted yet. Only the newest link works, so an old email (for
 * example one with a broken link) cannot be used once a new one is sent.
 */
async function renewInvitation(user, organizationId) {
  const token = createOneTimeToken();
  await user.update({ inviteToken: token.hash, ...(user.lastOrganizationId ? {} : { lastOrganizationId: organizationId }) });
  return token.raw;
}

/**
 * Makes sure a person belongs to an organization, creating an invited account for new email addresses. People who
 * were invited before but never accepted get a fresh invitation (they have no password yet, so "you were added"
 * would leave them locked out).
 */
export async function ensureOrganizationMember(organizationId, email, role = 'member', customRoleId = null) {
  let user = await User.scope('withSecrets').findOne({ where: { email } });
  const isMember = user && (await OrganizationMember.count({ where: { organizationId, userId: user.id } }));
  if (!isMember) await assertWithinLimit(organizationId, 'members');
  let inviteToken = null;
  if (!user) {
    const token = createOneTimeToken();
    inviteToken = token.raw;
    user = await User.create({ name: email.split('@')[0], email, status: 'invited', inviteToken: token.hash, avatarColor: pickAvatarColor(email), lastOrganizationId: organizationId });
  } else if (user.status === 'invited') {
    inviteToken = await renewInvitation(user, organizationId);
  }
  const roleId = role === 'admin' ? null : customRoleId;
  const [membership, created] = await OrganizationMember.findOrCreate({
    where: { organizationId, userId: user.id },
    defaults: { role, customRoleId: roleId },
  });
  return { user, membership, created, inviteToken };
}

/**
 * Sends the invitation again to someone in the organization who has not accepted yet (for example the first email
 * never arrived or its link did not work). Without invitation emails in the plan, the admin gets the link to share.
 */
export async function resendInvitation(organization, inviter, userId) {
  const membership = await OrganizationMember.findOne({ where: { organizationId: organization.id, userId } });
  const user = membership ? await User.scope('withSecrets').findByPk(userId) : null;
  if (!user) throw ApiError.notFound('This person is not in the organization');
  if (user.status !== 'invited') throw ApiError.badRequest(`${user.email} already joined. They can sign in, or reset their password from the sign-in page.`);
  const token = await renewInvitation(user, organization.id);
  const mayEmailInvite = entitlementsFor(organization).features.emailInvitations;
  if (mayEmailInvite) {
    const details = { inviterName: inviter.name, inviterEmail: inviter.email, organization, role: membership.role };
    await sendEmail({ to: user.email, ...organizationInviteEmail({ ...details, email: user.email, token }) });
  }
  return { emailed: mayEmailInvite, inviteLink: mayEmailInvite ? null : inviteLinkFor(token) };
}

/**
 * Invitation emails (to new people) follow the plan; when the plan leaves them out, the admin gets the sign-up link
 * to share themselves. People who already have an account are always told they were added.
 */
export async function inviteMember(organization, inviter, { email, role, customRoleId = null }) {
  assertInviteEmailAllowed(organization, email);
  if (customRoleId) {
    if (!customRolesEnabled(organization)) throw ApiError.forbidden('The current plan does not include custom roles');
    if (role === 'admin') throw ApiError.badRequest('Admins do not use a custom role');
    await assertCustomRole(organization.id, customRoleId);
  }
  const { user, created, inviteToken } = await ensureOrganizationMember(organization.id, email, role, customRoleId);
  if (!created) throw ApiError.conflict(`${email} is already in ${organization.name}`);
  const details = { inviterName: inviter.name, inviterEmail: inviter.email, organization, role };
  const mayEmailInvite = entitlementsFor(organization).features.emailInvitations;
  if (!inviteToken) await sendEmail({ to: email, ...addedToOrganizationEmail(details) });
  else if (mayEmailInvite) await sendEmail({ to: email, ...organizationInviteEmail({ ...details, email, token: inviteToken }) });
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: inviter.id,
    action: 'member.invited',
    targetType: 'user',
    targetId: user.id,
    meta: { email, role, invited: Boolean(inviteToken) },
  });
  return {
    ...(await listMembers(organization.id)).find((member) => member.id === user.id),
    invited: Boolean(inviteToken),
    emailed: !inviteToken || mayEmailInvite,
    inviteLink: inviteToken && !mayEmailInvite ? inviteLinkFor(inviteToken) : null,
  };
}
