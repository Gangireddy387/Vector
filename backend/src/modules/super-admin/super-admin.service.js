import bcrypt from 'bcryptjs';
import { config } from '../../config/index.js';
import { Organization, OrganizationMember, Project, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { organizationApprovedEmail, organizationRejectedEmail } from '../../shared/services/email-templates.js';
import { broadcastOrganization, toPublicOrganization } from '../organizations/organization.service.js';
import { setOrganizationPlan, withPlan } from '../plans/plan.service.js';
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
    creatorIds.length ? User.findAll({ where: { id: creatorIds }, attributes: ['id', 'name', 'email'], raw: true }) : [],
    ids.length ? OrganizationMember.findAll({ where: { organizationId: ids, status: 'active' }, attributes: ['organizationId'], raw: true }) : [],
    ids.length ? Project.findAll({ where: { organizationId: ids, archivedAt: null }, attributes: ['organizationId'], raw: true }) : [],
  ]);
  return organizations.map((organization) => ({
    ...toPublicOrganization(organization),
    rejectionReason: organization.rejectionReason ?? null,
    plan: organization.plan ? { id: organization.plan.id, name: organization.plan.name } : null,
    createdAt: organization.createdAt,
    reviewedAt: organization.reviewedAt,
    creator: creators.find((creator) => creator.id === organization.createdById) ?? null,
    memberCount: members.filter((row) => row.organizationId === organization.id).length,
    projectCount: projects.filter((row) => row.organizationId === organization.id).length,
  }));
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

export const approveOrganization = (organizationId, actor) => review(organizationId, actor, 'approved');
export const rejectOrganization = (organizationId, actor, { reason }) => review(organizationId, actor, 'rejected', reason?.trim() || null);
