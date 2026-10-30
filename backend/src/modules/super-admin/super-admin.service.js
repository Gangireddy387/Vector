import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Department, Issue, Organization, OrganizationMember, Project, Team, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { isUserOnline } from '../../shared/realtime/socket.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { organizationApprovedEmail, organizationRejectedEmail } from '../../shared/services/email-templates.js';
import { broadcastOrganization, toPublicOrganization } from '../organizations/organization.service.js';
import { entitlementsFor, featureSettingsFor, setOrganizationFeatures, setOrganizationPlan, withPlan } from '../plans/plan.service.js';
import { pickAvatarColor } from '../users/user.service.js';

export const isSuperAdmin = (user) => Boolean(config.superAdmin.email) && user?.email?.toLowerCase() === config.superAdmin.email;

/** Creates the super admin account from SUPER_ADMIN_* on startup, and keeps its password in sync with the env file. */
export async function ensureSuperAdmin() {
  const { email, password, name } = config.superAdmin;
  if (!email) return;
  const existing = await User.scope('withSecrets').findOne({ where: { email } });
  if (!password) {
    if (!existing) console.warn('[super-admin] SUPER_ADMIN_PASSWORD is empty, so the account was not created');
    return;
  }
  if (!existing) {
    await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), avatarColor: pickAvatarColor(email) });
    console.info(`[super-admin] created ${email}`);
    return;
  }
  const passwordMatches = existing.passwordHash && (await bcrypt.compare(password, existing.passwordHash));
  if (!passwordMatches || existing.status !== 'active') {
    await existing.update({ passwordHash: await bcrypt.hash(password, 10), status: 'active', inviteToken: null });
    console.info(`[super-admin] updated ${email} from the env file`);
  }
}

/** Every organization with its creator and a few counts, newest first. */
export async function listOrganizations() {
  const organizations = await Organization.findAll({ include: withPlan(), order: [['createdAt', 'DESC']] });
  const ids = organizations.map((organization) => organization.id);
  const creatorIds = [...new Set(organizations.map((organization) => organization.createdById).filter(Boolean))];
  const [creators, members, projects] = await Promise.all([
    creatorIds.length ? User.findAll({ where: { id: creatorIds }, attributes: ['id', 'name', 'email', 'title', 'avatarColor', 'avatarUrl'], raw: true }) : [],
    ids.length ? OrganizationMember.findAll({ where: { organizationId: ids, status: 'active' }, attributes: ['organizationId'], raw: true }) : [],
    ids.length ? Project.findAll({ where: { organizationId: ids, archivedAt: null }, attributes: ['organizationId'], raw: true }) : [],
  ]);
  return organizations.map((organization) => ({
    ...toPublicOrganization(organization),
    rejectionReason: organization.rejectionReason ?? null,
    plan: organization.plan ? { id: organization.plan.id, name: organization.plan.name } : null,
    customFeatureCount: entitlementsFor(organization).customFeatures.length,
    createdAt: organization.createdAt,
    reviewedAt: organization.reviewedAt,
    creator: creators.find((creator) => creator.id === organization.createdById) ?? null,
    memberCount: members.filter((row) => row.organizationId === organization.id).length,
    projectCount: projects.filter((row) => row.organizationId === organization.id).length,
  }));
}

const PERSON_FIELDS = ['id', 'name', 'email', 'title', 'avatarColor', 'avatarUrl', 'status', 'timezone', 'about', 'location', 'phone', 'skills', 'lastSeenAt'];

/**
 * One organization in detail for the super admin: its admins' full profiles, everyone else in short,
 * how much of its plan it uses and how much work lives in it.
 */
export async function getOrganizationDetail(organizationId) {
  const summary = (await listOrganizations()).find((item) => item.id === organizationId);
  if (!summary) throw ApiError.notFound('Organization not found');
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });

  const [memberships, projectIds, departments, teams] = await Promise.all([
    OrganizationMember.findAll({ where: { organizationId }, include: [{ model: User, as: 'user', attributes: PERSON_FIELDS }], order: [['createdAt', 'ASC']] }),
    Project.findAll({ where: { organizationId, archivedAt: null }, attributes: ['id'], raw: true }).then((rows) => rows.map((row) => row.id)),
    Department.count({ where: { organizationId } }),
    Team.count({ where: { organizationId } }),
  ]);
  const [openTasks, doneTasks] = projectIds.length
    ? await Promise.all([
        Issue.count({ where: { projectId: projectIds, completedAt: null } }),
        Issue.count({ where: { projectId: projectIds, completedAt: { [Op.ne]: null } } }),
      ])
    : [0, 0];

  const people = memberships
    .filter((membership) => membership.user)
    .map((membership) => {
      const user = membership.user.toJSON();
      return {
        ...user,
        skills: user.skills ?? [],
        status: user.status === 'invited' ? 'invited' : membership.status,
        role: membership.role,
        joinedAt: membership.createdAt,
        isCreator: user.id === organization.createdById,
        isOnline: isUserOnline(user.id),
      };
    })
    .sort((a, b) => Number(b.isCreator) - Number(a.isCreator) || a.name.localeCompare(b.name));

  return {
    organization: summary,
    limits: { maxMembers: organization.plan?.maxMembers ?? null, maxProjects: organization.plan?.maxProjects ?? null },
    features: featureSettingsFor(organization),
    counts: { departments, teams, openTasks, doneTasks },
    admins: people.filter((person) => person.role === 'admin'),
    members: people.filter((person) => person.role !== 'admin'),
  };
}

async function review(organizationId, actor, status, reason = null) {
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  if (!organization) throw ApiError.notFound('Organization not found');
  await organization.update({ status, rejectionReason: reason, reviewedAt: new Date(), reviewedById: actor.id });
  await broadcastOrganization(organization);

  const creator = organization.createdById ? await User.findByPk(organization.createdById) : null;
  if (creator) {
    const message =
      status === 'approved'
        ? organizationApprovedEmail({ organization, name: creator.name })
        : organizationRejectedEmail({ organization, name: creator.name, reason });
    await sendEmail({ to: creator.email, ...message });
  }
  return (await listOrganizations()).find((item) => item.id === organization.id);
}

/** Moves an organization to another plan; its people see the new features and limits right away. */
export async function changeOrganizationPlan(organizationId, planId) {
  await broadcastOrganization(await setOrganizationPlan(organizationId, planId));
  return (await listOrganizations()).find((item) => item.id === organizationId);
}

/** Turns features on or off for one organization, whatever its plan says; its people see the change right away. */
export async function changeOrganizationFeatures(organizationId, changes) {
  const organization = await setOrganizationFeatures(organizationId, changes);
  await broadcastOrganization(organization);
  return { organization: (await listOrganizations()).find((item) => item.id === organizationId), features: featureSettingsFor(organization) };
}

export const approveOrganization = (organizationId, actor) => review(organizationId, actor, 'approved');
export const rejectOrganization = (organizationId, actor, { reason }) => review(organizationId, actor, 'rejected', reason?.trim() || null);
