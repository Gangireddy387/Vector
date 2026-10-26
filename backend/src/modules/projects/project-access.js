import { ApiError } from '../../shared/errors/api-error.js';
import { Department, Issue, OrganizationMember, Project, ProjectMember, Team } from '../../database/models.js';
import { currentOrganizationId, currentOrganizationRole } from '../../shared/context/request-context.js';

const ROLE_RANK = { viewer: 1, member: 2, admin: 3 };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Organization admins oversee every project in their current organization as project admins, without joining it. */
export const isOrganizationAdminRequest = () => currentOrganizationRole() === 'admin' && Boolean(currentOrganizationId());

async function organizationAdminAccess(projectId, userId) {
  if (!isOrganizationAdminRequest()) return null;
  const project = await Project.findByPk(projectId, { attributes: ['organizationId'] });
  if (!project || project.organizationId !== currentOrganizationId()) return null;
  return { projectId, userId, role: 'admin', viaOrganization: true };
}

/** Department heads can view every project owned by a team in their department. */
async function departmentHeadAccess(projectId, userId) {
  const project = await Project.findByPk(projectId, {
    attributes: ['id'],
    include: [{ model: Team, as: 'team', attributes: ['id'], required: true, include: [{ model: Department, as: 'department', attributes: ['headId'], required: true }] }],
  });
  return project?.team?.department?.headId === userId ? { projectId, userId, role: 'viewer', viaDepartment: true } : null;
}

/** Projects owned by teams in departments the user heads, within an organization. */
async function headedProjectIds(userId, organizationId) {
  const projects = await Project.findAll({
    where: organizationId ? { organizationId } : {},
    attributes: ['id'],
    include: [{ model: Team, as: 'team', attributes: [], required: true, include: [{ model: Department, as: 'department', attributes: [], required: true, where: { headId: userId } }] }],
    raw: true,
  });
  return projects.map((project) => project.id);
}

export async function assertProjectRole(projectId, userId, minimumRole = 'viewer') {
  const projectMembership = await ProjectMember.findOne({ where: { projectId, userId } });
  // An organization admin always acts as a project admin, even where they joined with a lower role.
  const membership =
    (projectMembership?.role === 'admin' ? projectMembership : ((await organizationAdminAccess(projectId, userId)) ?? projectMembership)) ??
    (await departmentHeadAccess(projectId, userId));
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

/** Keys are unique per organization: pick the issue in a project the user can access, preferring the current organization. */
async function findIssueByKey(key, userId) {
  const candidates = await Issue.findAll({ where: { key }, include: [{ model: Project, as: 'project', attributes: ['organizationId'] }] });
  if (candidates.length <= 1) return candidates[0] ?? null;
  const memberOf = new Set(
    (await ProjectMember.findAll({ where: { userId, projectId: candidates.map((issue) => issue.projectId) }, attributes: ['projectId'], raw: true })).map((row) => row.projectId),
  );
  const organizationId = currentOrganizationId();
  const isAdmin = isOrganizationAdminRequest();
  const accessible = candidates.filter((issue) => memberOf.has(issue.projectId) || (isAdmin && issue.project?.organizationId === organizationId));
  return accessible.find((issue) => issue.project?.organizationId === organizationId) ?? accessible[0] ?? candidates[0];
}

/**
 * Projects the user can work in, limited to the current organization when the request has one.
 * Organization admins get every project in the organization.
 */
export async function getMemberProjectIds(userId) {
  const organizationId = currentOrganizationId();
  if (organizationId && isOrganizationAdminRequest()) {
    return (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
  }
  const [memberships, headed] = await Promise.all([
    ProjectMember.findAll({
      where: { userId },
      attributes: ['projectId'],
      include: organizationId ? [{ model: Project, as: 'project', attributes: [], where: { organizationId }, required: true }] : [],
      raw: true,
    }),
    headedProjectIds(userId, organizationId),
  ]);
  return [...new Set([...memberships.map((membership) => membership.projectId), ...headed])];
}

/** Projects a department head can view without being a member, for the project list. */
export const getHeadedProjectIds = (userId) => headedProjectIds(userId, currentOrganizationId());

/** Whether a user may follow a project live: a member, or an admin of the project's organization. */
export async function canWatchProject(projectId, userId) {
  if (await ProjectMember.count({ where: { projectId, userId } })) return true;
  const project = await Project.findByPk(projectId, { attributes: ['organizationId'] });
  if (!project?.organizationId) return false;
  if (await OrganizationMember.count({ where: { organizationId: project.organizationId, userId, role: 'admin', status: 'active' } })) return true;
  return Boolean(await departmentHeadAccess(projectId, userId));
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
