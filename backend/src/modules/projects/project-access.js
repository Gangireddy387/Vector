import { ApiError } from '../../shared/errors/api-error.js';
import { Department, Issue, Organization, OrganizationMember, Project, ProjectMember, Team } from '../../database/models.js';
import { currentOrganizationId, currentOrganizationRole } from '../../shared/context/request-context.js';
import { isUuid, UUID_PATTERN } from '../../shared/utils/ids.js';

const ROLE_RANK = { viewer: 1, member: 2, admin: 3 };

/** Organization admins oversee every project in their current organization as project admins, without joining it. */
export const isOrganizationAdminRequest = () => currentOrganizationRole() === 'admin' && Boolean(currentOrganizationId());

/**
 * The project and the person's place in its organization. Access to a project always requires being an active member
 * of an approved organization that owns it: disabling or removing someone from the organization ends their access to
 * every project in it at once, wherever they come from (another organization, a socket, a link).
 */
async function projectWithOrganizationRole(projectId, userId) {
  if (!isUuid(projectId)) return { project: null, organizationRole: null };
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'organizationId'],
    include: [{ model: Organization, as: 'organization', attributes: ['id', 'status'] }],
  });
  if (!project) return { project: null, organizationRole: null };
  // Projects from before organizations existed belong to everyone who is a member of them.
  if (!project.organizationId) return { project, organizationRole: 'member' };
  if (project.organization?.status !== 'approved') return { project, organizationRole: null };
  const membership = await OrganizationMember.findOne({
    where: { organizationId: project.organizationId, userId, status: 'active' },
    attributes: ['role'],
  });
  return { project, organizationRole: membership?.role ?? null };
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

/** The person's role in a project, or null when they have no access (including when they left its organization). */
export async function projectRoleOf(projectId, userId) {
  const { project, organizationRole } = await projectWithOrganizationRole(projectId, userId);
  if (!project || !organizationRole) return null;
  // An organization admin always acts as a project admin, even where they joined with a lower role.
  if (organizationRole === 'admin') return { projectId, userId, role: 'admin', viaOrganization: true };
  const projectMembership = await ProjectMember.findOne({ where: { projectId, userId } });
  return projectMembership ?? (await departmentHeadAccess(projectId, userId));
}

export async function assertProjectRole(projectId, userId, minimumRole = 'viewer') {
  const membership = await projectRoleOf(projectId, userId);
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

/** Whether a user may follow a project live: the same rule as opening it. */
export const canWatchProject = async (projectId, userId) => Boolean(await projectRoleOf(projectId, userId));

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

/**
 * Running sprints (planning, starting, completing them) belongs to the people who run the project: its admins
 * (organization admins included), its lead and the lead of the team that owns it. Everyone else works inside sprints.
 */
export const sprintManagerRule = ({ role, userId, projectLeadId, teamLeadId }) =>
  role === 'admin' || (role === 'member' && Boolean(userId) && (projectLeadId === userId || teamLeadId === userId));

/** Route guard for planning, starting and completing a project's sprints. */
export const requireSprintManager = async (req, _res, next) => {
  const membership = await assertProjectRole(req.params.projectId, req.user.id, 'member');
  const project = await Project.findByPk(req.params.projectId, { attributes: ['leadId'], include: [{ model: Team, as: 'team', attributes: ['leadId'] }] });
  const allowed = sprintManagerRule({ role: membership.role, userId: req.user.id, projectLeadId: project?.leadId, teamLeadId: project?.team?.leadId });
  if (!allowed) throw ApiError.forbidden('Only the project’s admins, its lead and its team lead can manage sprints');
  req.membership = membership;
  next();
};
