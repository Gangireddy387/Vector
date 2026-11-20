import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import {
  Comment,
  Issue,
  Label,
  Organization,
  Project,
  ShareLink,
  Sprint,
  Status,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { hashPassword } from '../auth/auth.service.js';
import { isShareAccessToken, signShareAccessToken, verifyAccessToken } from '../auth/token.js';
import { createComment } from '../comments/comment.service.js';
import { decorateIssues, ISSUE_REFERENCE_ATTRIBUTES, STATUS_SUMMARY_ATTRIBUTES } from '../issues/issue.queries.js';
import { assertFeature, entitlementsFor, withPlan } from '../plans/plan.service.js';
import { assertProjectRole, loadIssueWithAccess } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const newToken = () => crypto.randomBytes(18).toString('base64url');
const BOARD_LIMIT = 500;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';

const publicUser = (user) =>
  user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, avatarColor: user.avatarColor } : null;

const publicIssueCard = (issue) => ({
  id: issue.id,
  key: issue.key,
  title: issue.title,
  type: issue.type,
  priority: issue.priority,
  dueDate: issue.dueDate ?? null,
  storyPoints: issue.storyPoints ?? null,
  status: issue.status
    ? { id: issue.status.id, name: issue.status.name, category: issue.status.category, color: issue.status.color }
    : null,
  assignee: publicUser(issue.assignee),
  labels: (issue.labels ?? []).map((label) => ({ id: label.id, name: label.name, color: label.color })),
  parent: issue.parent ? { id: issue.parent.id, key: issue.parent.key, title: issue.parent.title, type: issue.parent.type } : null,
  subtaskProgress: issue.subtaskProgress ?? { total: 0, done: 0 },
  commentCount: issue.commentCount ?? 0,
  attachmentCount: 0,
});

function describeShare(share) {
  if (!share) {
    return { enabled: false, token: null, hasPassword: false, expiresAt: null, guestCommentsEnabled: false };
  }
  return {
    enabled: true,
    token: share.token,
    createdAt: share.createdAt,
    hasPassword: Boolean(share.passwordHash),
    expiresAt: share.expiresAt ?? null,
    guestCommentsEnabled: Boolean(share.guestCommentsEnabled),
  };
}

async function activeBoardShare(projectId) {
  return ShareLink.findOne({ where: { projectId, scope: 'board', revokedAt: null, issueId: null } });
}

async function activeIssueShare(issueId) {
  return ShareLink.findOne({ where: { issueId, scope: 'issue', revokedAt: null } });
}

async function loadOrgWithPlan(organizationId) {
  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  if (!organization || organization.status !== 'approved') {
    throw ApiError.notFound('This share link does not work any more.');
  }
  if (!entitlementsFor(organization).features.publicShare) {
    throw ApiError.notFound('This share link does not work any more.');
  }
  return organization;
}

/** Build create/update fields from the admin toggle body. */
async function settingsFromBody(body = {}, { allowGuestComments }) {
  const patch = {};
  if (body.password !== undefined) {
    if (!body.password) patch.passwordHash = null;
    else patch.passwordHash = await hashPassword(body.password);
  }
  if (body.expiresAt !== undefined) {
    patch.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (patch.expiresAt && Number.isNaN(patch.expiresAt.getTime())) {
      throw ApiError.badRequest('Expiry must be a valid date');
    }
  }
  if (allowGuestComments && body.guestCommentsEnabled !== undefined) {
    patch.guestCommentsEnabled = Boolean(body.guestCommentsEnabled);
  } else if (!allowGuestComments) {
    patch.guestCommentsEnabled = false;
  }
  return patch;
}

function readShareAccessId(authorization) {
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    const payload = verifyAccessToken(authorization.slice(7));
    if (!isShareAccessToken(payload) || !payload.sid) return null;
    return payload.sid;
  } catch {
    return null;
  }
}

function assertShareUnlocked(share, authorization) {
  if (!share.passwordHash) return;
  const shareId = readShareAccessId(authorization);
  if (shareId !== share.id) {
    const error = ApiError.forbidden('This share link is password protected.');
    error.details = { code: 'share_locked', requiresPassword: true };
    throw error;
  }
}

export async function getBoardShare(userId, projectId) {
  await assertProjectRole(projectId, userId, 'admin');
  return describeShare(await activeBoardShare(projectId));
}

export async function setBoardShare(userId, projectId, body) {
  const { enabled, reset = false } = body;
  const membership = await assertProjectRole(projectId, userId, 'admin');
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId', 'archivedAt'] });
  if (!project || project.archivedAt) throw ApiError.notFound('Project not found');
  const organization = await loadOrgWithPlan(project.organizationId);
  assertFeature(organization, 'publicShare');

  const existing = await activeBoardShare(projectId);
  if (!enabled) {
    if (existing) await existing.update({ revokedAt: new Date() });
    return describeShare(null);
  }

  const settings = await settingsFromBody(body, { allowGuestComments: false });

  if (existing && !reset) {
    if (Object.keys(settings).length) await existing.update(settings);
    await existing.reload();
    return describeShare(existing);
  }
  if (existing) await existing.update({ revokedAt: new Date() });

  const share = await ShareLink.create({
    token: newToken(),
    organizationId: project.organizationId,
    projectId,
    issueId: null,
    scope: 'board',
    createdById: membership.userId ?? userId,
    passwordHash: settings.passwordHash ?? null,
    expiresAt: settings.expiresAt ?? null,
    guestCommentsEnabled: false,
  });
  return describeShare(share);
}

export async function getIssueShare(userId, issueIdOrKey) {
  const { id: issueId, projectId } = await loadIssueWithAccess(issueIdOrKey, userId, 'member');
  await assertProjectRole(projectId, userId, 'member');
  return describeShare(await activeIssueShare(issueId));
}

export async function setIssueShare(userId, issueIdOrKey, body) {
  const { enabled, reset = false } = body;
  const { id: issueId, projectId } = await loadIssueWithAccess(issueIdOrKey, userId, 'member');
  const membership = await assertProjectRole(projectId, userId, 'member');
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId', 'archivedAt'] });
  if (!project || project.archivedAt) throw ApiError.notFound('Project not found');
  const organization = await loadOrgWithPlan(project.organizationId);
  assertFeature(organization, 'publicShare');

  const existing = await activeIssueShare(issueId);
  if (!enabled) {
    if (existing) await existing.update({ revokedAt: new Date() });
    return describeShare(null);
  }

  const settings = await settingsFromBody(body, { allowGuestComments: true });

  if (existing && !reset) {
    if (Object.keys(settings).length) await existing.update(settings);
    await existing.reload();
    return describeShare(existing);
  }
  if (existing) await existing.update({ revokedAt: new Date() });

  const share = await ShareLink.create({
    token: newToken(),
    organizationId: project.organizationId,
    projectId,
    issueId,
    scope: 'issue',
    createdById: membership.userId ?? userId,
    passwordHash: settings.passwordHash ?? null,
    expiresAt: settings.expiresAt ?? null,
    guestCommentsEnabled: settings.guestCommentsEnabled ?? false,
  });
  return describeShare(share);
}

async function resolveShare(token) {
  const share = await ShareLink.findOne({ where: { token, revokedAt: null } });
  if (!share) throw ApiError.notFound('This share link does not work any more.');
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    throw ApiError.notFound('This share link does not work any more.');
  }
  const organization = await loadOrgWithPlan(share.organizationId);
  const project = await Project.findByPk(share.projectId, {
    attributes: ['id', 'key', 'name', 'color', 'type', 'archivedAt', 'organizationId'],
  });
  if (!project || project.archivedAt || project.organizationId !== share.organizationId) {
    throw ApiError.notFound('This share link does not work any more.');
  }
  return { share, organization, project };
}

function lockedPayload(share, organization, project) {
  return {
    locked: true,
    requiresPassword: true,
    scope: share.scope,
    organization: { id: organization.id, name: organization.name, logoUrl: organization.logoUrl },
    project: { id: project.id, key: project.key, name: project.name, color: project.color, type: project.type },
  };
}

async function listPublicComments(issueId) {
  const rows = await Comment.findAll({
    where: { issueId, parentId: null },
    include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'ASC']],
  });
  return rows.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      body: json.body,
      createdAt: json.createdAt,
      authorName: json.author?.name ?? json.guestAuthorName ?? 'Guest',
      isGuest: !json.authorId,
    };
  });
}

async function loadBoardPayload(project) {
  const statuses = await Status.findAll({
    where: { projectId: project.id },
    attributes: [...STATUS_SUMMARY_ATTRIBUTES, 'position'],
    order: [['position', 'ASC']],
  });

  const where = { projectId: project.id, type: { [Op.ne]: 'epic' } };
  let sprint = null;
  if (project.type === 'scrum') {
    sprint = await Sprint.findOne({
      where: { projectId: project.id, state: 'active' },
      attributes: ['id', 'name', 'state'],
    });
    if (sprint) where.sprintId = sprint.id;
  }

  const rows = await Issue.findAll({
    where,
    include: [
      { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES },
      { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
      { model: Issue, as: 'parent', attributes: ISSUE_REFERENCE_ATTRIBUTES },
    ],
    order: [['position', 'ASC']],
    limit: BOARD_LIMIT,
  });
  const issues = (await decorateIssues(rows)).map(publicIssueCard);

  return {
    scope: 'board',
    guestCommentsEnabled: false,
    project: { id: project.id, key: project.key, name: project.name, color: project.color, type: project.type },
    sprint: sprint ? { id: sprint.id, name: sprint.name, state: sprint.state } : null,
    columns: statuses.map((status) => ({
      status: { id: status.id, name: status.name, category: status.category, color: status.color },
      issues: issues.filter((issue) => issue.status?.id === status.id),
    })),
  };
}

async function loadIssuePayload(share, project) {
  const issue = await Issue.findByPk(share.issueId, {
    include: [
      { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'reporter', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES },
      { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
      { model: Issue, as: 'parent', attributes: ISSUE_REFERENCE_ATTRIBUTES },
      { model: Sprint, as: 'sprint', attributes: ['id', 'name', 'state'] },
    ],
  });
  if (!issue || issue.projectId !== project.id) {
    throw ApiError.notFound('This share link does not work any more.');
  }

  const subtasks = await Issue.findAll({
    where: { parentId: issue.id },
    include: [{ model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES }],
    order: [['position', 'ASC']],
  });

  const [decorated] = await decorateIssues([issue]);
  const comments = share.guestCommentsEnabled ? await listPublicComments(issue.id) : [];
  const commentCount = share.guestCommentsEnabled
    ? comments.length
    : await Comment.count({ where: { issueId: issue.id, parentId: null } });

  return {
    scope: 'issue',
    guestCommentsEnabled: Boolean(share.guestCommentsEnabled),
    comments,
    project: { id: project.id, key: project.key, name: project.name, color: project.color, type: project.type },
    issue: {
      ...publicIssueCard({ ...decorated, commentCount }),
      description: issue.description ?? null,
      reporter: publicUser(issue.reporter),
      sprint: issue.sprint ? { id: issue.sprint.id, name: issue.sprint.name, state: issue.sprint.state } : null,
      subtasks: subtasks.map((subtask) => ({
        id: subtask.id,
        key: subtask.key,
        title: subtask.title,
        type: subtask.type,
        status: subtask.status
          ? { id: subtask.status.id, name: subtask.status.name, category: subtask.status.category, color: subtask.status.color }
          : null,
      })),
    },
  };
}

async function buildPublicPayload(share, organization, project) {
  const base = {
    locked: false,
    requiresPassword: false,
    organization: { id: organization.id, name: organization.name, logoUrl: organization.logoUrl },
  };
  if (share.scope === 'board') return { ...base, ...(await loadBoardPayload(project)) };
  return { ...base, ...(await loadIssuePayload(share, project)) };
}

/** Public read of a share link (no auth). Passworded links need a share-access Bearer token. */
export async function getPublicShare(token, authorization) {
  const { share, organization, project } = await resolveShare(token);
  if (share.passwordHash) {
    try {
      assertShareUnlocked(share, authorization);
    } catch (error) {
      if (error instanceof ApiError && error.details?.code === 'share_locked') {
        return lockedPayload(share, organization, project);
      }
      throw error;
    }
  }
  return buildPublicPayload(share, organization, project);
}

/** Verify the share password and return an access token plus the unlocked payload. */
export async function unlockPublicShare(token, password) {
  const { share, organization, project } = await resolveShare(token);
  if (!share.passwordHash) {
    return { accessToken: null, ...(await buildPublicPayload(share, organization, project)) };
  }
  const ok = await bcrypt.compare(password ?? '', share.passwordHash || DUMMY_HASH);
  if (!ok) throw ApiError.unauthorized('Incorrect password');
  const accessToken = signShareAccessToken(share.id);
  return { accessToken, ...(await buildPublicPayload(share, organization, project)) };
}

/** Guest comment on an issue share (honeypot filtered by the route). */
export async function createPublicShareComment(token, authorization, { name, body }) {
  const { share, organization, project } = await resolveShare(token);
  assertShareUnlocked(share, authorization);
  if (share.scope !== 'issue' || !share.guestCommentsEnabled) {
    throw ApiError.forbidden('Guest comments are not enabled on this link.');
  }

  const issue = await Issue.findByPk(share.issueId);
  if (!issue || issue.projectId !== project.id) {
    throw ApiError.notFound('This share link does not work any more.');
  }

  // Touch organization so plan/feature stays consistent with resolveShare.
  void organization;

  const created = await createComment(issue, null, body, {
    source: 'share_guest',
    guestAuthorName: name.trim(),
  });

  return {
    id: created.id,
    body: created.body,
    createdAt: created.createdAt,
    authorName: name.trim(),
    isGuest: true,
  };
}
