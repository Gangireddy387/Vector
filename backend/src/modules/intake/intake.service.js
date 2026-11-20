import crypto from 'node:crypto';
import { IntakeForm, Organization, Project } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { createIssue } from '../issues/issue.service.js';
import { ISSUE_PRIORITIES } from '../issues/issue.model.js';
import { assertFeature, entitlementsFor, withPlan } from '../plans/plan.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { DEFAULT_INTAKE_SETTINGS } from './intake.model.js';

const newToken = () => crypto.randomBytes(18).toString('base64url');
const withSettings = (form) => ({ ...DEFAULT_INTAKE_SETTINGS, ...(form.settings ?? {}) });

function describe(form) {
  if (!form || form.revokedAt) return { enabled: false, token: null };
  return {
    enabled: true,
    token: form.token,
    title: form.title,
    intro: form.intro,
    issueType: form.issueType,
    defaultPriority: form.defaultPriority,
    settings: withSettings(form),
    createdAt: form.createdAt,
  };
}

async function activeForm(projectId) {
  return IntakeForm.findOne({ where: { projectId, revokedAt: null } });
}

async function loadOrg(organizationId) {
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  if (!organization || organization.status !== 'approved') {
    throw ApiError.notFound('This request form does not work any more.');
  }
  if (!entitlementsFor(organization).features.intakeForms) {
    throw ApiError.notFound('This request form does not work any more.');
  }
  return organization;
}

export async function getProjectIntake(userId, projectId) {
  await assertProjectRole(projectId, userId, 'admin');
  return describe(await activeForm(projectId));
}

export async function setProjectIntake(userId, projectId, input) {
  const membership = await assertProjectRole(projectId, userId, 'admin');
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId', 'archivedAt', 'name', 'key', 'color'] });
  if (!project || project.archivedAt) throw ApiError.notFound('Project not found');
  const organization = await loadOrg(project.organizationId);
  assertFeature(organization, 'intakeForms');

  const existing = await activeForm(projectId);
  if (input.enabled === false) {
    if (existing) await existing.update({ revokedAt: new Date() });
    return describe(null);
  }

  const patch = {};
  if (input.title !== undefined) patch.title = String(input.title).trim().slice(0, 120) || 'Submit a request';
  if (input.intro !== undefined) patch.intro = input.intro ? String(input.intro).trim().slice(0, 2000) : null;
  if (input.issueType !== undefined) patch.issueType = input.issueType;
  if (input.defaultPriority !== undefined) patch.defaultPriority = input.defaultPriority;
  if (input.settings !== undefined) patch.settings = { ...withSettings(existing ?? {}), ...input.settings };

  if (existing && !input.reset) {
    await existing.update(patch);
    return describe(await existing.reload());
  }
  if (existing) await existing.update({ revokedAt: new Date() });

  const form = await IntakeForm.create({
    token: newToken(),
    organizationId: project.organizationId,
    projectId,
    title: patch.title ?? existing?.title ?? 'Submit a request',
    intro: patch.intro !== undefined ? patch.intro : (existing?.intro ?? null),
    issueType: patch.issueType ?? existing?.issueType ?? 'task',
    defaultPriority: patch.defaultPriority ?? existing?.defaultPriority ?? 'medium',
    settings: patch.settings ?? withSettings(existing ?? {}),
    createdById: membership.userId ?? userId,
  });
  return describe(form);
}

async function resolveForm(token) {
  const form = await IntakeForm.findOne({ where: { token, revokedAt: null } });
  if (!form) throw ApiError.notFound('This request form does not work any more.');
  const organization = await loadOrg(form.organizationId);
  const project = await Project.findByPk(form.projectId, {
    attributes: ['id', 'key', 'name', 'color', 'archivedAt', 'organizationId'],
  });
  if (!project || project.archivedAt || project.organizationId !== form.organizationId) {
    throw ApiError.notFound('This request form does not work any more.');
  }
  return { form, organization, project };
}

/** Public schema for the request page (no secrets). */
export async function getPublicIntake(token) {
  const { form, organization, project } = await resolveForm(token);
  const settings = withSettings(form);
  return {
    title: form.title,
    intro: form.intro,
    organization: { name: organization.name, logoUrl: organization.logoUrl },
    project: { key: project.key, name: project.name, color: project.color },
    fields: {
      askDescription: settings.askDescription !== false,
      askPriority: Boolean(settings.askPriority),
      priorities: settings.askPriority ? ISSUE_PRIORITIES : [],
      defaultPriority: form.defaultPriority,
    },
  };
}

/** Public submit → creates an issue with no reporter account. */
export async function submitPublicIntake(token, body) {
  const { form, project } = await resolveForm(token);
  const settings = withSettings(form);

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const title = String(body.title || '').trim();
  const description = body.description != null ? String(body.description).trim() : '';
  if (name.length < 2) throw ApiError.badRequest('Enter your name (at least 2 characters)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest('Enter a valid email address');
  if (title.length < 3) throw ApiError.badRequest('Give your request a short title');
  if (title.length > 255) throw ApiError.badRequest('Title is too long');
  if (description.length > 10_000) throw ApiError.badRequest('Description is too long');

  let priority = form.defaultPriority;
  if (settings.askPriority && body.priority) {
    if (!ISSUE_PRIORITIES.includes(body.priority)) throw ApiError.badRequest('Pick a valid priority');
    priority = body.priority;
  }

  const footer = `\n\n---\nSubmitted via request form by **${name}** <${email}>`;
  const fullDescription = settings.askDescription !== false && description ? `${description}${footer}` : `Submitted via request form.${footer}`;

  const issue = await createIssue(
    {
      projectId: project.id,
      title: title.slice(0, 255),
      description: fullDescription,
      type: form.issueType === 'epic' || form.issueType === 'subtask' ? 'task' : form.issueType,
      priority,
    },
    null,
    { source: 'intake' },
  );

  return {
    key: issue.key,
    title: issue.title,
    project: { key: project.key, name: project.name },
  };
}
