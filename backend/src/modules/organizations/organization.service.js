import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Issue, Organization, OrganizationMember, Project, ProjectMember, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { addedToOrganizationEmail, organizationInviteEmail, organizationReviewRequestEmail } from '../../shared/services/email-templates.js';
import { createImageStore } from '../../shared/services/image-store.js';
import { removeFromStructure } from '../departments/department.service.js';
import { assertWithinLimit, entitlementsFor, getDefaultPlan, usageFor } from '../plans/plan.service.js';
import { createOneTimeToken } from '../auth/token.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { pickAvatarColor } from '../users/user.service.js';

/** Organization addresses sit right after the domain (example.com/acme), so they must never shadow an app page or look official. */
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'account', 'accounts', 'login', 'logout', 'register', 'signup', 'signin', 'settings', 'projects',
  'issues', 'reports', 'search', 'inbox', 'notifications', 'organizations', 'organization', 'new', 'help', 'support', 'docs',
  'privacy', 'terms', 'legal', 'status', 'billing', 'vector', 'www', 'mail', 'static', 'assets', 'public', 'root', 'system',
  'accept-invite', 'forgot-password', 'reset-password', 'more', 'home', 'dashboard', 'invite', 'join', 'me', 'user', 'users',
  'board', 'backlog', 'chat', 'standup', 'progress', 'automation', 'team', 'teams', 'workspace', 'about', 'pricing', 'blog',
  'super-admin', 'superadmin', 'pending-approval', 'calendar',
]);
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');

export const toPublicOrganization = (organization) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  defaultMode: organization.defaultMode,
  logoUrl: organization.logoUrl ?? null,
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
  return memberships.map((membership) => ({
    ...toPublicOrganization(membership.organization),
    role: membership.role,
    memberCount: people.filter((row) => row.organizationId === membership.organizationId).length,
    projectCount: projects.filter((row) => row.organizationId === membership.organizationId).length,
  }));
}

export async function switchOrganization(user, memberships, organizationId) {
  const membership = memberships.find((item) => item.organizationId === organizationId);
  if (!membership) throw ApiError.notFound('Organization not found');
  await user.update({ lastOrganizationId: organizationId });
  return membership;
}

export async function getPublicOrganization(slug) {
  const organization = await Organization.findOne({ where: { slug: slugify(slug) } });
  if (!organization) throw ApiError.notFound('Organization not found');
  return { name: organization.name, slug: organization.slug, defaultMode: organization.defaultMode };
}

// --- Settings & people of the current organization ---------------------------

export async function updateOrganization(organization, actor, changes) {
  const updates = { ...changes, updatedById: actor.id };
  if (changes.slug !== undefined) updates.slug = await assertSlugAvailable(changes.slug, organization.id);
  if (changes.name !== undefined) updates.name = changes.name.trim();
  await organization.update(updates);
  return broadcastOrganization(organization);
}

/** The current organization's plan and how much of it is used, for its settings page. */
export async function getPlanOverview(organization) {
  return { entitlements: entitlementsFor(organization), usage: await usageFor(organization.id) };
}

/** Pushes the organization's current settings and status to every member's open browsers. */
export async function broadcastOrganization(organization) {
  const result = toPublicOrganization(organization);
  const members = await OrganizationMember.findAll({ where: { organizationId: organization.id, status: 'active' }, attributes: ['userId'], raw: true });
  members.forEach((member) => emitToUser(member.userId, 'workspace:updated', result));
  return result;
}

export async function setLogo(organization, actor, file) {
  const logoUrl = await logos.save(file);
  const previous = organization.logoUrl;
  await organization.update({ logoUrl, updatedById: actor.id });
  await logos.remove(previous);
  return broadcastOrganization(organization);
}

export async function clearLogo(organization, actor) {
  const previous = organization.logoUrl;
  await organization.update({ logoUrl: null, updatedById: actor.id });
  await logos.remove(previous);
  return broadcastOrganization(organization);
}

export async function listMembers(organizationId) {
  const memberships = await OrganizationMember.findAll({
    where: { organizationId },
    include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status', 'lastSeenAt', 'createdAt'] }],
  });
  const projectIds = (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
  const projectMemberships = projectIds.length ? await ProjectMember.findAll({ where: { projectId: projectIds }, attributes: ['userId'], raw: true }) : [];
  return memberships
    .filter((membership) => membership.user)
    .map((membership) => {
      const user = membership.user.toJSON();
      return {
        ...user,
        // An invited account that has not been accepted yet shows as invited; otherwise the organization-level status applies.
        status: user.status === 'invited' ? 'invited' : membership.status,
        workspaceRole: membership.role,
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

export async function updateMember(organizationId, actor, userId, { workspaceRole, status }) {
  if (userId === actor.id) throw ApiError.badRequest('You cannot change your own role or status');
  const membership = await loadMembership(organizationId, userId);
  const losesAdmin = membership.role === 'admin' && (workspaceRole === 'member' || status === 'disabled');
  if (losesAdmin) await assertAnotherAdmin(organizationId, userId);
  if (status && membership.user.status === 'invited') throw ApiError.badRequest('Invited people become active when they accept');
  if (status === 'active' && membership.status === 'disabled') await assertWithinLimit(organizationId, 'members');
  await membership.update({ ...(workspaceRole ? { role: workspaceRole } : {}), ...(status ? { status } : {}) });
  return (await listMembers(organizationId)).find((member) => member.id === userId);
}

/** Removes someone from the organization and from every project in it; their work becomes unassigned. */
export async function removeMember(organizationId, actor, userId) {
  if (userId === actor.id) throw ApiError.badRequest('You cannot remove yourself. Ask another admin.');
  const membership = await loadMembership(organizationId, userId);
  if (membership.role === 'admin') await assertAnotherAdmin(organizationId, userId);
  const projectIds = (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
  if (projectIds.length) {
    await ProjectMember.destroy({ where: { projectId: projectIds, userId } });
    await Issue.update({ assigneeId: null }, { where: { projectId: projectIds, assigneeId: userId } });
  }
  await removeFromStructure(organizationId, userId);
  await membership.destroy();
  if (membership.user.lastOrganizationId === organizationId) await membership.user.update({ lastOrganizationId: null });
}

/** Deletes the organization with all of its projects and work. People keep their accounts and other organizations. */
export async function deleteOrganization(organization, { confirmName }) {
  if (confirmName.trim() !== organization.name) throw ApiError.badRequest('Type the organization name exactly to confirm', [{ path: 'confirmName', message: 'The name does not match' }]);
  const projects = await Project.findAll({ where: { organizationId: organization.id } });
  for (const project of projects) await project.destroy();
  await logos.remove(organization.logoUrl);
  await User.update({ lastOrganizationId: null }, { where: { lastOrganizationId: organization.id } });
  await OrganizationMember.destroy({ where: { organizationId: organization.id } });
  await organization.destroy();
}

/** Makes sure a person belongs to an organization, creating an invited account for new email addresses. */
export async function ensureOrganizationMember(organizationId, email, role = 'member') {
  let user = await User.findOne({ where: { email } });
  const isMember = user && (await OrganizationMember.count({ where: { organizationId, userId: user.id } }));
  if (!isMember) await assertWithinLimit(organizationId, 'members');
  let inviteToken = null;
  if (!user) {
    const token = createOneTimeToken();
    inviteToken = token.raw;
    user = await User.create({ name: email.split('@')[0], email, status: 'invited', inviteToken: token.hash, avatarColor: pickAvatarColor(email), lastOrganizationId: organizationId });
  }
  const [membership, created] = await OrganizationMember.findOrCreate({ where: { organizationId, userId: user.id }, defaults: { role } });
  return { user, membership, created, inviteToken };
}

export async function inviteMember(organization, inviter, { email, role }) {
  const { user, created, inviteToken } = await ensureOrganizationMember(organization.id, email, role);
  if (!created) throw ApiError.conflict(`${email} is already in ${organization.name}`);
  const details = { inviterName: inviter.name, inviterEmail: inviter.email, organization, role };
  const message = inviteToken ? organizationInviteEmail({ ...details, email, token: inviteToken }) : addedToOrganizationEmail(details);
  await sendEmail({ to: email, ...message });
  return { ...(await listMembers(organization.id)).find((member) => member.id === user.id), invited: Boolean(inviteToken) };
}
