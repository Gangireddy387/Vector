import { Issue, Label, Project, ProjectMember, Sprint, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { addedToProjectEmail, inviteEmail } from '../../shared/services/email-templates.js';
import { logActivity } from '../activity/activity.service.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { DEFAULT_LABELS } from '../labels/label.model.js';
import { ensureOrganizationMember } from '../organizations/organization.service.js';
import { DEFAULT_STATUSES } from '../statuses/status.model.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { pickAvatarColor } from '../users/user.service.js';
import { DEFAULT_PROJECT_SETTINGS } from './project.model.js';

const withDefaultSettings = (project) => ({ ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}) });

async function summarizeIssues(projectIds) {
  const [issues, statuses] = await Promise.all([
    Issue.findAll({ where: { projectId: projectIds }, attributes: ['projectId', 'statusId'], raw: true }),
    Status.findAll({ where: { projectId: projectIds }, attributes: ['id', 'category'], raw: true }),
  ]);
  const categoryById = new Map(statuses.map((status) => [status.id, status.category]));
  const summary = new Map(projectIds.map((id) => [id, { total: 0, open: 0, done: 0 }]));
  issues.forEach((issue) => {
    const entry = summary.get(issue.projectId);
    entry.total += 1;
    if (categoryById.get(issue.statusId) === 'done') entry.done += 1;
    else entry.open += 1;
  });
  return summary;
}

export async function listProjects(userId, { includeArchived }) {
  const memberships = await ProjectMember.findAll({
    where: { userId },
    include: [
      {
        model: Project,
        as: 'project',
        where: { organizationId: currentOrganizationId() },
        include: [{ model: User, as: 'lead', attributes: USER_SUMMARY_ATTRIBUTES }],
      },
    ],
  });
  const projects = memberships
    .filter((membership) => includeArchived || !membership.project.archivedAt)
    .map((membership) => ({ ...membership.project.toJSON(), myRole: membership.role }));

  const ids = projects.map((project) => project.id);
  if (!ids.length) return [];

  const [issueSummary, memberRows, activeSprints] = await Promise.all([
    summarizeIssues(ids),
    ProjectMember.findAll({ where: { projectId: ids }, attributes: ['projectId'], raw: true }),
    Sprint.findAll({ where: { projectId: ids, state: 'active' }, attributes: ['id', 'projectId', 'name', 'endDate'], raw: true }),
  ]);

  return projects
    .map((project) => ({
      ...project,
      settings: withDefaultSettings(project),
      issueSummary: issueSummary.get(project.id),
      memberCount: memberRows.filter((row) => row.projectId === project.id).length,
      activeSprint: activeSprints.find((sprint) => sprint.projectId === project.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProject(user, input) {
  const organizationId = currentOrganizationId();
  if (!organizationId) throw ApiError.badRequest('Create or join an organization first');
  const existing = await Project.findOne({ where: { organizationId, key: input.key } });
  if (existing) throw ApiError.conflict(`Project key "${input.key}" is already used in this organization`);

  const project = await Project.create({
    ...input,
    organizationId,
    color: input.color ?? pickAvatarColor(input.key),
    leadId: user.id,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
  });
  await ProjectMember.create({ projectId: project.id, userId: user.id, role: 'admin' });
  await Status.bulkCreate(DEFAULT_STATUSES.map((status, index) => ({ ...status, projectId: project.id, position: index })));
  await Label.bulkCreate(DEFAULT_LABELS.map((label) => ({ ...label, projectId: project.id })));
  if (project.type === 'scrum') {
    await Sprint.create({ projectId: project.id, name: `${project.key} Sprint 1` });
  }
  await logActivity({ projectId: project.id, actorId: user.id, action: 'project_created', toValue: project.name });
  return getProject(project.id, user.id);
}

export async function getProject(projectId, userId) {
  const project = await Project.findByPk(projectId, {
    include: [
      { model: User, as: 'lead', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: Status, as: 'statuses' },
      { model: Label, as: 'labels' },
      {
        model: ProjectMember,
        as: 'memberships',
        include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status'] }],
      },
    ],
    order: [
      [{ model: Status, as: 'statuses' }, 'position', 'ASC'],
      [{ model: Label, as: 'labels' }, 'name', 'ASC'],
    ],
  });
  if (!project) throw ApiError.notFound('Project not found');

  const json = project.toJSON();
  const myMembership = json.memberships.find((membership) => membership.userId === userId);
  return {
    ...json,
    settings: withDefaultSettings(json),
    myRole: myMembership?.role ?? null,
    members: json.memberships.map((membership) => ({ ...membership.user, role: membership.role, memberId: membership.id })),
    memberships: undefined,
  };
}

export async function updateProject(projectId, user, changes) {
  const project = await Project.findByPk(projectId);
  const { settings, archived, ...rest } = changes;
  const updates = { ...rest };

  if (settings) updates.settings = { ...withDefaultSettings(project), ...settings };
  if (archived !== undefined) updates.archivedAt = archived ? new Date() : null;
  if (rest.leadId) await assertIsMember(projectId, rest.leadId);
  if (settings?.defaultAssigneeId) await assertIsMember(projectId, settings.defaultAssigneeId);

  await project.update(updates);
  await logActivity({ projectId, actorId: user.id, action: 'project_updated', meta: { fields: Object.keys(changes) } });
  return getProject(projectId, user.id);
}

export async function deleteProject(projectId) {
  await Project.destroy({ where: { id: projectId } });
}

async function assertIsMember(projectId, userId) {
  const exists = await ProjectMember.count({ where: { projectId, userId } });
  if (!exists) throw ApiError.badRequest('The selected user is not a member of this project');
}

/** Adding someone to a project also makes them a member of the project's organization (an invite for new emails). */
export async function addMember(projectId, inviter, { email, role }) {
  const project = await Project.findByPk(projectId);
  const { user, inviteToken } = await ensureOrganizationMember(project.organizationId, email);

  const existing = await ProjectMember.findOne({ where: { projectId, userId: user.id } });
  if (existing) throw ApiError.conflict(`${email} is already a member of this project`);
  await ProjectMember.create({ projectId, userId: user.id, role });

  const message = inviteToken
    ? inviteEmail({ inviterName: inviter.name, projectName: project.name, token: inviteToken })
    : addedToProjectEmail({ inviterName: inviter.name, projectName: project.name, projectId });
  await sendEmail({ to: email, ...message });

  await logActivity({ projectId, actorId: inviter.id, action: 'member_added', toValue: user.name, meta: { role } });
  eventBus.publish(DomainEvents.MEMBER_ADDED, { project, user, actorId: inviter.id });
  return { ...user.toJSON(), role, invited: Boolean(inviteToken) };
}

async function ensureAnotherAdminRemains(projectId, userId) {
  const admins = await ProjectMember.count({ where: { projectId, role: 'admin' } });
  const target = await ProjectMember.findOne({ where: { projectId, userId } });
  if (!target) throw ApiError.notFound('Member not found');
  if (target.role === 'admin' && admins <= 1) throw ApiError.badRequest('A project needs at least one admin');
  return target;
}

export async function updateMemberRole(projectId, userId, role) {
  const membership = role === 'admin'
    ? await ProjectMember.findOne({ where: { projectId, userId } })
    : await ensureAnotherAdminRemains(projectId, userId);
  if (!membership) throw ApiError.notFound('Member not found');
  await membership.update({ role });
  return membership;
}

export async function removeMember(projectId, userId, actor) {
  const membership = await ensureAnotherAdminRemains(projectId, userId);
  await membership.destroy();
  await Issue.update({ assigneeId: null }, { where: { projectId, assigneeId: userId } });
  await logActivity({ projectId, actorId: actor.id, action: 'member_removed', meta: { userId } });
}
