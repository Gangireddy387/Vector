import crypto from 'node:crypto';
import {
  IntakeForm,
  IntakeSubmission,
  Issue,
  Organization,
  Project,
  ProjectMember,
  Status,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { createIssue, updateIssue } from '../issues/issue.service.js';
import { ISSUE_PRIORITIES } from '../issues/issue.model.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { assertFeature, entitlementsFor, withPlan } from '../plans/plan.service.js';
import { assertProjectRole } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
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

/** Holding column for pending requests — reuse or create “Requests”. */
async function resolveReviewStatusId(projectId, preferredId) {
  if (preferredId) {
    const preferred = await Status.findOne({ where: { id: preferredId, projectId }, attributes: ['id'] });
    if (preferred) return preferred.id;
  }
  const existing = await Status.findOne({ where: { projectId, name: 'Requests' }, attributes: ['id'] });
  if (existing) return existing.id;

  const minPos = await Status.min('position', { where: { projectId } });
  const position = Number.isFinite(Number(minPos)) ? Number(minPos) - 1 : 0;
  const created = await Status.create({
    projectId,
    name: 'Requests',
    category: 'todo',
    color: '#f59e0b',
    position,
  });
  return created.id;
}

async function defaultAcceptStatusId(projectId, reviewStatusId) {
  const statuses = await Status.findAll({
    where: { projectId },
    attributes: ['id', 'category', 'position'],
    order: [['position', 'ASC']],
  });
  const next =
    statuses.find((status) => status.id !== reviewStatusId && status.category !== 'done') ??
    statuses.find((status) => status.id !== reviewStatusId);
  return next?.id ?? null;
}

async function defaultRejectStatusId(projectId) {
  const done = await Status.findOne({
    where: { projectId, category: 'done' },
    attributes: ['id'],
    order: [['position', 'ASC']],
  });
  return done?.id ?? null;
}

async function notifyProjectApprovers(projectId, issue) {
  const admins = await ProjectMember.findAll({
    where: { projectId, role: 'admin' },
    attributes: ['userId'],
    raw: true,
  });
  const userIds = [...new Set(admins.map((row) => row.userId))];
  if (!userIds.length) return;
  await notifyUsers({
    userIds,
    type: 'intake_pending',
    title: `New request waiting: ${issue.key}`,
    body: issue.title,
    link: `/issues/${issue.key}`,
    issueId: issue.id,
    projectId,
    email: true,
  });
}

export async function getProjectIntake(userId, projectId) {
  await assertProjectRole(projectId, userId, 'admin');
  const intake = describe(await activeForm(projectId));
  const pendingCount = await IntakeSubmission.count({ where: { projectId, state: 'pending' } });
  return { ...intake, pendingCount };
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
    return { ...describe(null), pendingCount: await IntakeSubmission.count({ where: { projectId, state: 'pending' } }) };
  }

  const patch = {};
  if (input.title !== undefined) patch.title = String(input.title).trim().slice(0, 120) || 'Submit a request';
  if (input.intro !== undefined) patch.intro = input.intro ? String(input.intro).trim().slice(0, 2000) : null;
  if (input.issueType !== undefined) patch.issueType = input.issueType;
  if (input.defaultPriority !== undefined) patch.defaultPriority = input.defaultPriority;
  if (input.settings !== undefined) {
    const merged = { ...withSettings(existing ?? {}), ...input.settings };
    if (merged.requireApproval) {
      merged.reviewStatusId = await resolveReviewStatusId(projectId, merged.reviewStatusId ?? null);
    }
    patch.settings = merged;
  }

  if (existing && !input.reset) {
    await existing.update(patch);
    const intake = describe(await existing.reload());
    return { ...intake, pendingCount: await IntakeSubmission.count({ where: { projectId, state: 'pending' } }) };
  }
  if (existing) await existing.update({ revokedAt: new Date() });

  let settings = patch.settings ?? withSettings(existing ?? {});
  if (settings.requireApproval) {
    settings = {
      ...settings,
      reviewStatusId: await resolveReviewStatusId(projectId, settings.reviewStatusId ?? null),
    };
  }

  const form = await IntakeForm.create({
    token: newToken(),
    organizationId: project.organizationId,
    projectId,
    title: patch.title ?? existing?.title ?? 'Submit a request',
    intro: patch.intro !== undefined ? patch.intro : (existing?.intro ?? null),
    issueType: patch.issueType ?? existing?.issueType ?? 'task',
    defaultPriority: patch.defaultPriority ?? existing?.defaultPriority ?? 'medium',
    settings,
    createdById: membership.userId ?? userId,
  });
  return { ...describe(form), pendingCount: await IntakeSubmission.count({ where: { projectId, state: 'pending' } }) };
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
      requireApproval: Boolean(settings.requireApproval),
    },
  };
}

/** Public submit → creates an issue (optionally held for approval). */
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

  const requireApproval = Boolean(settings.requireApproval);
  const statusId = requireApproval
    ? await resolveReviewStatusId(project.id, settings.reviewStatusId ?? null)
    : undefined;

  const issue = await createIssue(
    {
      projectId: project.id,
      title: title.slice(0, 255),
      description: fullDescription,
      type: form.issueType === 'epic' || form.issueType === 'subtask' ? 'task' : form.issueType,
      priority,
      ...(statusId ? { statusId } : {}),
    },
    null,
    { source: 'intake' },
  );

  if (requireApproval) {
    await IntakeSubmission.create({
      intakeFormId: form.id,
      organizationId: form.organizationId,
      projectId: project.id,
      issueId: issue.id,
      submitterName: name.slice(0, 80),
      submitterEmail: email.slice(0, 190),
      state: 'pending',
    });
    await notifyProjectApprovers(project.id, issue).catch(() => {});
  }

  return {
    key: issue.key,
    title: issue.title,
    project: { key: project.key, name: project.name },
    pendingReview: requireApproval,
    message: requireApproval
      ? 'Your request was received and is waiting for review.'
      : undefined,
  };
}

export async function listIntakeSubmissions(userId, projectId, { state = 'pending' } = {}) {
  await assertProjectRole(projectId, userId, 'admin');
  const where = { projectId };
  if (state && state !== 'all') where.state = state;

  const rows = await IntakeSubmission.findAll({
    where,
    include: [
      {
        model: Issue,
        as: 'issue',
        attributes: ['id', 'key', 'title', 'priority', 'statusId', 'createdAt'],
        include: [{ model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] }],
      },
      { model: User, as: 'reviewedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  return rows.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      state: json.state,
      submitterName: json.submitterName,
      submitterEmail: json.submitterEmail,
      reviewNote: json.reviewNote,
      reviewedAt: json.reviewedAt,
      reviewedBy: json.reviewedBy ?? null,
      createdAt: json.createdAt,
      issue: json.issue
        ? {
            id: json.issue.id,
            key: json.issue.key,
            title: json.issue.title,
            priority: json.issue.priority,
            status: json.issue.status ?? null,
            createdAt: json.issue.createdAt,
          }
        : null,
    };
  });
}

async function loadPendingSubmission(projectId, submissionId) {
  const submission = await IntakeSubmission.findOne({
    where: { id: submissionId, projectId },
    include: [{ model: Issue, as: 'issue' }],
  });
  if (!submission) throw ApiError.notFound('Request not found');
  if (submission.state !== 'pending') throw ApiError.badRequest('This request was already reviewed');
  if (!submission.issue) throw ApiError.notFound('Linked task not found');
  return submission;
}

export async function approveIntakeSubmission(userId, projectId, submissionId, { note, statusId } = {}) {
  await assertProjectRole(projectId, userId, 'admin');
  const submission = await loadPendingSubmission(projectId, submissionId);
  const form = await IntakeForm.findByPk(submission.intakeFormId);
  const settings = withSettings(form ?? {});
  const reviewStatusId = settings.reviewStatusId ?? submission.issue.statusId;
  const targetStatusId = statusId || (await defaultAcceptStatusId(projectId, reviewStatusId));
  if (!targetStatusId) throw ApiError.badRequest('No status available to accept this request into');

  const actor = await User.findByPk(userId);
  const transitionComment = note?.trim()
    ? `Request approved: ${note.trim()}`
    : 'Request approved — ready for the team.';

  // system source bypasses workflow edges so the holding column cannot trap approvals.
  await updateIssue(
    submission.issue.id,
    { statusId: targetStatusId, transitionComment },
    actor,
    { source: 'system' },
  );

  await submission.update({
    state: 'approved',
    reviewedById: userId,
    reviewedAt: new Date(),
    reviewNote: note?.trim() || null,
  });

  return (await listIntakeSubmissions(userId, projectId, { state: 'all' })).find((row) => row.id === submission.id);
}

export async function rejectIntakeSubmission(userId, projectId, submissionId, { note, statusId } = {}) {
  await assertProjectRole(projectId, userId, 'admin');
  const submission = await loadPendingSubmission(projectId, submissionId);
  const targetStatusId = statusId || (await defaultRejectStatusId(projectId));
  const actor = await User.findByPk(userId);
  const transitionComment = note?.trim()
    ? `Request rejected: ${note.trim()}`
    : 'Request rejected.';

  if (targetStatusId && targetStatusId !== submission.issue.statusId) {
    await updateIssue(
      submission.issue.id,
      { statusId: targetStatusId, transitionComment },
      actor,
      { source: 'system' },
    );
  } else {
    const { createComment } = await import('../comments/comment.service.js');
    await createComment(submission.issue, actor, transitionComment, { source: 'intake_approval' });
  }

  await submission.update({
    state: 'rejected',
    reviewedById: userId,
    reviewedAt: new Date(),
    reviewNote: note?.trim() || null,
  });

  return (await listIntakeSubmissions(userId, projectId, { state: 'all' })).find((row) => row.id === submission.id);
}

/** Optional banner data when opening an issue that came from intake. */
export async function getIssueIntakeSubmission(userId, issueIdOrKey) {
  const { loadIssueWithAccess } = await import('../projects/project-access.js');
  const issue = await loadIssueWithAccess(issueIdOrKey, userId, 'viewer');
  const submission = await IntakeSubmission.findOne({
    where: { issueId: issue.id },
    include: [{ model: User, as: 'reviewedBy', attributes: USER_SUMMARY_ATTRIBUTES }],
  });
  if (!submission) return null;
  const json = submission.toJSON();
  return {
    id: json.id,
    state: json.state,
    submitterName: json.submitterName,
    submitterEmail: json.submitterEmail,
    reviewNote: json.reviewNote,
    reviewedAt: json.reviewedAt,
    reviewedBy: json.reviewedBy ?? null,
    createdAt: json.createdAt,
  };
}
