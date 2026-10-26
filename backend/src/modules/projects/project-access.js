import { ApiError } from '../../shared/errors/api-error.js';
import { Issue, Project, ProjectMember } from '../../database/models.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';

const ROLE_RANK = { viewer: 1, member: 2, admin: 3 };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertProjectRole(projectId, userId, minimumRole = 'viewer') {
  const membership = await ProjectMember.findOne({ where: { projectId, userId } });
  if (!membership) throw ApiError.notFound('Project not found');
  if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
    throw ApiError.forbidden(`This action requires the ${minimumRole} role in this project`);
  }
  return membership;
}

/** Loads an issue (by id or key) and verifies the user may access its project. */
export async function loadIssueWithAccess(issueIdOrKey, userId, minimumRole = 'viewer') {
  const isKey = /^[A-Z][A-Z0-9]*-\d+$/i.test(issueIdOrKey);
  if (!isKey && !UUID_PATTERN.test(issueIdOrKey)) throw ApiError.notFound('Task not found');
  const issue = isKey ? await findIssueByKey(issueIdOrKey.toUpperCase(), userId) : await Issue.findByPk(issueIdOrKey);
  if (!issue) throw ApiError.notFound('Task not found');
  await assertProjectRole(issue.projectId, userId, minimumRole);
  return issue;
}

/** Keys are unique per organization: pick the issue in a project the user belongs to, preferring the current organization. */
async function findIssueByKey(key, userId) {
  const candidates = await Issue.findAll({ where: { key }, include: [{ model: Project, as: 'project', attributes: ['organizationId'] }] });
  if (candidates.length <= 1) return candidates[0] ?? null;
  const memberOf = new Set(
    (await ProjectMember.findAll({ where: { userId, projectId: candidates.map((issue) => issue.projectId) }, attributes: ['projectId'], raw: true })).map((row) => row.projectId),
  );
  const accessible = candidates.filter((issue) => memberOf.has(issue.projectId));
  return accessible.find((issue) => issue.project?.organizationId === currentOrganizationId()) ?? accessible[0] ?? candidates[0];
}

/** Projects the user belongs to, limited to the current organization when the request has one. */
export async function getMemberProjectIds(userId) {
  const organizationId = currentOrganizationId();
  const memberships = await ProjectMember.findAll({
    where: { userId },
    attributes: ['projectId'],
    include: organizationId ? [{ model: Project, as: 'project', attributes: [], where: { organizationId }, required: true }] : [],
    raw: true,
  });
  return memberships.map((membership) => membership.projectId);
}

/** Route guard for routes that carry `:issueId`; exposes the issue as `req.issue`. */
export const requireIssueRole = (minimumRole = 'viewer') => async (req, _res, next) => {
  req.issue = await loadIssueWithAccess(req.params.issueId, req.user.id, minimumRole);
  next();
};

/** Route guard for routes that carry `:projectId`. */
export const requireProjectRole = (minimumRole = 'viewer') => async (req, _res, next) => {
  req.membership = await assertProjectRole(req.params.projectId, req.user.id, minimumRole);
  next();
};
