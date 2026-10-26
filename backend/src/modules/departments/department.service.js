import { Op } from 'sequelize';
import { Department, Issue, OrganizationMember, Project, ProjectMember, sequelize, Status, Team, TeamMember, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const person = (as) => ({ model: User, as, attributes: USER_SUMMARY_ATTRIBUTES });

/**
 * What someone may see of the structure: organization admins see everything; others see the departments they head
 * (with all of their teams) and the teams they are in. `null` means everything.
 */
async function visibilityFor(organizationId, viewer) {
  if (!viewer || viewer.isAdmin) return null;
  const [headed, memberships] = await Promise.all([
    Department.findAll({ where: { organizationId, headId: viewer.userId }, attributes: ['id'], raw: true }),
    TeamMember.findAll({ where: { userId: viewer.userId }, attributes: ['teamId'], raw: true }),
  ]);
  return { headedDepartmentIds: new Set(headed.map((row) => row.id)), teamIds: new Set(memberships.map((row) => row.teamId)) };
}

const canSeeTeam = (visibility, team) => !visibility || visibility.teamIds.has(team.id) || visibility.headedDepartmentIds.has(team.departmentId);

/** The organization's structure: departments with their head and teams (lead and members), limited to what the viewer may see. */
export async function listDepartments(organizationId, viewer) {
  const [departments, visibility] = await Promise.all([
    Department.findAll({
      where: { organizationId },
      include: [
        person('head'),
        {
          model: Team,
          as: 'teams',
          include: [person('lead'), { ...person('members'), through: { attributes: [] } }],
        },
      ],
      order: [
        ['name', 'ASC'],
        [{ model: Team, as: 'teams' }, 'name', 'ASC'],
      ],
    }),
    visibilityFor(organizationId, viewer),
  ]);
  // Projects belong to teams; a team's and a department's task counts add up the projects they own.
  const projects = await Project.findAll({ where: { organizationId, archivedAt: null, teamId: { [Op.ne]: null } }, attributes: ['id', 'teamId'], raw: true });
  const counts = await workByProject(projects.map((project) => project.id));
  const teamWork = (teamId) => sumWork(projects.filter((project) => project.teamId === teamId).map((project) => counts.get(project.id)));

  return departments
    .map((department) => {
      const value = department.toJSON();
      value.teams = value.teams
        .filter((team) => canSeeTeam(visibility, team))
        .map((team) => ({
          ...team,
          members: [...team.members].sort((a, b) => a.name.localeCompare(b.name)),
          projectCount: projects.filter((project) => project.teamId === team.id).length,
          work: teamWork(team.id),
        }));
      value.projectCount = value.teams.reduce((sum, team) => sum + team.projectCount, 0);
      value.work = sumWork(value.teams.map((team) => team.work));
      return value;
    })
    .filter((department) => !visibility || visibility.headedDepartmentIds.has(department.id) || department.teams.length > 0);
}

const PROJECT_ATTRIBUTES = ['id', 'key', 'name', 'color', 'type', 'teamId', 'archivedAt'];
const emptyWork = () => ({ total: 0, todo: 0, inProgress: 0, done: 0, overdue: 0 });
const sumWork = (list) =>
  list.reduce((sum, item) => {
    Object.keys(sum).forEach((key) => (sum[key] += item[key]));
    return sum;
  }, emptyWork());

/** Task counts per project: to do, in progress, done and overdue (past due and not done). */
async function workByProject(projectIds) {
  const summary = new Map(projectIds.map((id) => [id, emptyWork()]));
  if (!projectIds.length) return summary;
  const [issues, statuses] = await Promise.all([
    Issue.findAll({ where: { projectId: projectIds }, attributes: ['projectId', 'statusId', 'dueDate'], raw: true }),
    Status.findAll({ where: { projectId: projectIds }, attributes: ['id', 'category'], raw: true }),
  ]);
  const categoryById = new Map(statuses.map((status) => [status.id, status.category]));
  const today = new Date().toISOString().slice(0, 10);
  for (const issue of issues) {
    const entry = summary.get(issue.projectId);
    const category = categoryById.get(issue.statusId);
    entry.total += 1;
    if (category === 'done') entry.done += 1;
    else {
      if (category === 'in_progress') entry.inProgress += 1;
      else entry.todo += 1;
      if (issue.dueDate && String(issue.dueDate).slice(0, 10) < today) entry.overdue += 1;
    }
  }
  return summary;
}

const projectSummary = (project, counts) => ({
  id: project.id,
  key: project.key,
  name: project.name,
  color: project.color,
  type: project.type,
  lead: project.lead,
  work: counts.get(project.id),
});

/**
 * A team's projects with their task counts and leads, and totals across them. Admins also get the organization's
 * other projects (with the team that owns them, if any) so they can bring them in.
 */
export async function getTeamWork(organizationId, teamId, viewer) {
  const team = await findTeam(organizationId, teamId);
  if (!canSeeTeam(await visibilityFor(organizationId, viewer), team)) throw ApiError.notFound('Team not found');
  const all = await Project.findAll({
    where: { organizationId, archivedAt: null, ...(viewer?.isAdmin ? {} : { teamId: team.id }) },
    attributes: PROJECT_ATTRIBUTES,
    include: [
      person('lead'),
      { model: Team, as: 'team', attributes: ['id', 'name'], include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }] },
    ],
    order: [['name', 'ASC']],
  });
  const owned = all.filter((project) => project.teamId === team.id);
  const counts = await workByProject(owned.map((project) => project.id));
  const projects = owned.map((project) => projectSummary(project, counts));
  const otherProjects = all
    .filter((project) => project.teamId !== team.id)
    .map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      color: project.color,
      team: project.team ? { id: project.team.id, name: project.team.name, departmentName: project.team.department?.name ?? null } : null,
    }));
  return { projects, totals: sumWork(projects.map((project) => project.work)), otherProjects };
}

/** Every project owned by the department's teams the viewer may see, grouped by team, with task counts. */
export async function getDepartmentProjects(organizationId, departmentId, viewer) {
  const department = await findDepartment(organizationId, departmentId);
  const visibility = await visibilityFor(organizationId, viewer);
  const teams = (await Team.findAll({ where: { departmentId: department.id }, attributes: ['id', 'name', 'departmentId'], order: [['name', 'ASC']], raw: true })).filter(
    (team) => canSeeTeam(visibility, team),
  );
  if (visibility && !teams.length && !visibility.headedDepartmentIds.has(department.id)) throw ApiError.notFound('Department not found');
  const teamIds = teams.map((team) => team.id);
  const projects = teamIds.length
    ? await Project.findAll({ where: { organizationId, archivedAt: null, teamId: teamIds }, attributes: PROJECT_ATTRIBUTES, include: [person('lead')], order: [['name', 'ASC']] })
    : [];
  const counts = await workByProject(projects.map((project) => project.id));
  return {
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      projects: projects.filter((project) => project.teamId === team.id).map((project) => projectSummary(project, counts)),
    })),
  };
}

async function findOrganizationProject(organizationId, projectId) {
  const project = await Project.findOne({ where: { id: projectId, organizationId } });
  if (!project) throw ApiError.notFound('Project not found');
  return project;
}

// --- Team access to projects ----------------------------------------------------------------
// Everyone in a team is a member of the team's projects. People added to a project directly, from outside the
// owning team, are guests. Access that came from the team (`viaTeam`) is removed again when someone leaves it.

const teamMemberIds = async (teamId) => (await TeamMember.findAll({ where: { teamId }, attributes: ['userId'], raw: true })).map((row) => row.userId);
const teamProjectIds = async (teamId) => (await Project.findAll({ where: { teamId }, attributes: ['id'], raw: true })).map((project) => project.id);

/** Adds the team's people to the given projects (or all of the team's projects) as members. */
export async function grantTeamAccess(teamId, projectIds) {
  const [people, projects] = await Promise.all([teamMemberIds(teamId), projectIds ?? teamProjectIds(teamId)]);
  if (!people.length || !projects.length) return;
  const existing = new Set(
    (await ProjectMember.findAll({ where: { projectId: projects, userId: people }, attributes: ['projectId', 'userId'], raw: true })).map((row) => `${row.projectId}:${row.userId}`),
  );
  const missing = projects.flatMap((projectId) => people.filter((userId) => !existing.has(`${projectId}:${userId}`)).map((userId) => ({ projectId, userId, role: 'member', viaTeam: true })));
  if (missing.length) await ProjectMember.bulkCreate(missing);
}

/** Removes access that came from the team; memberships given on the project itself are kept. */
async function revokeTeamAccess(userIds, projectIds) {
  if (!userIds.length || !projectIds.length) return;
  await ProjectMember.destroy({ where: { projectId: projectIds, userId: userIds, viaTeam: true } });
}

/** When a project leaves a team, the people who got in through the team keep access as ordinary members. */
async function keepTeamAccess(projectIds) {
  if (projectIds.length) await ProjectMember.update({ viaTeam: false }, { where: { projectId: projectIds, viaTeam: true } });
}

/** Puts a project (and all of its tasks) under a team; a project belongs to one team at most. Its people join it. */
export async function assignProject(organizationId, teamId, projectId) {
  const team = await findTeam(organizationId, teamId);
  const project = await findOrganizationProject(organizationId, projectId);
  const previousTeamId = project.teamId;
  await project.update({ teamId: team.id });
  if (previousTeamId && previousTeamId !== team.id) {
    const newPeople = new Set(await teamMemberIds(team.id));
    const leaving = (await teamMemberIds(previousTeamId)).filter((userId) => !newPeople.has(userId));
    await revokeTeamAccess(leaving, [project.id]);
    await keepTeamAccess([project.id]);
  }
  await grantTeamAccess(team.id, [project.id]);
}

export async function unassignProject(organizationId, teamId, projectId) {
  await findTeam(organizationId, teamId);
  const project = await findOrganizationProject(organizationId, projectId);
  if (project.teamId !== teamId) return;
  await project.update({ teamId: null });
  await keepTeamAccess([project.id]);
}

const findDepartment = async (organizationId, departmentId) => {
  const department = await Department.findOne({ where: { id: departmentId, organizationId } });
  if (!department) throw ApiError.notFound('Department not found');
  return department;
};

const findTeam = async (organizationId, teamId) => {
  const team = await Team.findOne({ where: { id: teamId, organizationId } });
  if (!team) throw ApiError.notFound('Team not found');
  return team;
};

/** Heads, leads and team members must be active members of this organization. */
async function assertMembers(organizationId, userIds, field) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const found = await OrganizationMember.count({ where: { organizationId, userId: ids, status: 'active' } });
  if (found !== ids.length) {
    const message = ids.length === 1 ? 'Choose someone from this organization' : 'Everyone must be an active member of this organization';
    throw ApiError.badRequest(message, [{ path: field, message }]);
  }
}

/** Names are unique regardless of letter case. */
const nameLike = (name) => (sequelize.getDialect() === 'postgres' ? { [Op.iLike]: name } : name);

async function assertDepartmentName(organizationId, name, exceptId) {
  const clash = await Department.findOne({ where: { organizationId, name: nameLike(name), ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) } });
  if (clash) throw ApiError.badRequest(`A department called “${name}” already exists`, [{ path: 'name', message: 'This name is already used' }]);
}

async function assertTeamName(departmentId, name, exceptId) {
  const clash = await Team.findOne({ where: { departmentId, name: nameLike(name), ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) } });
  if (clash) throw ApiError.badRequest(`This department already has a team called “${name}”`, [{ path: 'name', message: 'This name is already used' }]);
}

// --- Departments ---------------------------------------------------------------

export async function createDepartment(organizationId, { name, description = null, headId = null }) {
  await assertDepartmentName(organizationId, name);
  await assertMembers(organizationId, [headId], 'headId');
  const department = await Department.create({ organizationId, name, description, headId });
  return department.id;
}

export async function updateDepartment(organizationId, departmentId, changes) {
  const department = await findDepartment(organizationId, departmentId);
  if (changes.name !== undefined) await assertDepartmentName(organizationId, changes.name, department.id);
  if (changes.headId) await assertMembers(organizationId, [changes.headId], 'headId');
  await department.update(changes);
}

/** Removes the department with all of its teams; people stay in the organization and the teams' projects become unassigned. */
export async function deleteDepartment(organizationId, departmentId) {
  const department = await findDepartment(organizationId, departmentId);
  const teamIds = (await Team.findAll({ where: { departmentId: department.id }, attributes: ['id'], raw: true })).map((team) => team.id);
  if (teamIds.length) {
    const projectIds = (await Project.findAll({ where: { organizationId, teamId: teamIds }, attributes: ['id'], raw: true })).map((project) => project.id);
    await keepTeamAccess(projectIds);
    await Project.update({ teamId: null }, { where: { organizationId, teamId: teamIds } });
  }
  await department.destroy();
}

// --- Teams -----------------------------------------------------------------------

/** The lead is always a member; returns the final member list. */
const withLead = (memberIds, leadId) => [...new Set([...(memberIds ?? []), ...(leadId ? [leadId] : [])])];

export async function createTeam(organizationId, departmentId, { name, description = null, leadId = null, memberIds = [] }) {
  const department = await findDepartment(organizationId, departmentId);
  await assertTeamName(department.id, name);
  const members = withLead(memberIds, leadId);
  await assertMembers(organizationId, members, 'memberIds');
  const team = await Team.create({ organizationId, departmentId: department.id, name, description, leadId });
  await TeamMember.bulkCreate(members.map((userId) => ({ teamId: team.id, userId })));
  return team.id;
}

export async function updateTeam(organizationId, teamId, { memberIds, ...changes }) {
  const team = await findTeam(organizationId, teamId);
  if (changes.name !== undefined) await assertTeamName(team.departmentId, changes.name, team.id);
  if (changes.departmentId && changes.departmentId !== team.departmentId) {
    await findDepartment(organizationId, changes.departmentId);
    await assertTeamName(changes.departmentId, changes.name ?? team.name, team.id);
  }
  const leadId = changes.leadId !== undefined ? changes.leadId : team.leadId;

  let members = null;
  if (memberIds !== undefined) members = withLead(memberIds, leadId);
  else if (changes.leadId) members = withLead((await TeamMember.findAll({ where: { teamId }, attributes: ['userId'], raw: true })).map((row) => row.userId), leadId);
  if (members) await assertMembers(organizationId, members, 'memberIds');

  await team.update(changes);
  if (members) {
    const before = await teamMemberIds(teamId);
    await TeamMember.destroy({ where: { teamId, userId: { [Op.notIn]: members.length ? members : [team.id] } } });
    const existing = new Set(await teamMemberIds(teamId));
    await TeamMember.bulkCreate(members.filter((userId) => !existing.has(userId)).map((userId) => ({ teamId, userId })));
    // Leavers lose the projects they had through the team; newcomers get them.
    await revokeTeamAccess(before.filter((userId) => !members.includes(userId)), await teamProjectIds(teamId));
    await grantTeamAccess(teamId);
  }
}

/** Removes the team; its people stay in the organization and its projects become unassigned. */
export async function deleteTeam(organizationId, teamId) {
  const team = await findTeam(organizationId, teamId);
  await keepTeamAccess(await teamProjectIds(team.id));
  await Project.update({ teamId: null }, { where: { organizationId, teamId: team.id } });
  await team.destroy();
}

/** When someone leaves the organization they leave its teams, and stop being a head or lead there. */
export async function removeFromStructure(organizationId, userId) {
  const teamIds = (await Team.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((team) => team.id);
  if (teamIds.length) {
    const projectIds = (await Project.findAll({ where: { teamId: teamIds }, attributes: ['id'], raw: true })).map((project) => project.id);
    await revokeTeamAccess([userId], projectIds);
    await TeamMember.destroy({ where: { teamId: teamIds, userId } });
  }
  await Team.update({ leadId: null }, { where: { organizationId, leadId: userId } });
  await Department.update({ headId: null }, { where: { organizationId, headId: userId } });
}
