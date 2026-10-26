import { Op } from 'sequelize';
import { Activity, Comment, Department, Issue, OrganizationMember, Project, ProjectMember, Team, TeamMember, User, WorkLog } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { localDateTime } from '../../shared/utils/timezone.js';

const RECENT_DAYS = 30;
const PROFILE_FIELDS = ['id', 'name', 'email', 'title', 'avatarColor', 'avatarUrl', 'status', 'timezone', 'about', 'location', 'phone', 'skills', 'lastSeenAt', 'createdAt'];
const projectReference = { model: Project, as: 'project', attributes: ['id', 'name', 'key', 'color'] };

/**
 * Everything an organization admin sees on someone's profile: who they are, where they sit in the structure,
 * the projects they work in and how their work is going. Only work inside this organization is counted.
 */
export async function getMemberProfile(organizationId, userId) {
  const membership = await OrganizationMember.findOne({
    where: { organizationId, userId },
    include: [{ model: User, as: 'user', attributes: PROFILE_FIELDS }],
  });
  if (!membership?.user) throw ApiError.notFound('This person is not in the organization');
  const user = membership.user.toJSON();

  const organizationProjectIds = (await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true })).map((project) => project.id);
  const inOrganization = { projectId: organizationProjectIds };
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const today = localDateTime(user.timezone).date;
  const issueInOrganization = { model: Issue, as: 'issue', attributes: [], where: inOrganization, required: true };

  const [headOf, teamMemberships, projectMemberships, assigned, recentComments, recentWork, activity, completed] = await Promise.all([
    Department.findAll({ where: { organizationId, headId: userId }, attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    TeamMember.findAll({ where: { userId }, attributes: ['teamId'], raw: true }),
    ProjectMember.findAll({ where: { userId, ...inOrganization }, include: [projectReference] }),
    Issue.findAll({ where: { assigneeId: userId, ...inOrganization }, attributes: ['projectId', 'completedAt', 'dueDate'], raw: true }),
    Comment.count({ where: { authorId: userId, createdAt: { [Op.gte]: since } }, include: [issueInOrganization] }),
    WorkLog.findAll({ where: { userId, loggedAt: { [Op.gte]: since } }, attributes: ['minutes'], include: [issueInOrganization], raw: true }),
    Activity.findAll({
      where: { actorId: userId, ...inOrganization },
      include: [{ model: Issue, as: 'issue', attributes: ['id', 'key', 'title', 'type'] }, projectReference],
      order: [['createdAt', 'DESC']],
      limit: 15,
    }),
    Issue.findAll({
      where: { assigneeId: userId, completedAt: { [Op.ne]: null }, ...inOrganization },
      attributes: ['id', 'key', 'title', 'completedAt'],
      include: [projectReference],
      order: [['completedAt', 'DESC']],
      limit: 5,
    }),
  ]);

  const teams = teamMemberships.length
    ? await Team.findAll({
        where: { id: teamMemberships.map((row) => row.teamId), organizationId },
        attributes: ['id', 'name', 'leadId'],
        include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
        order: [['name', 'ASC']],
      })
    : [];

  const open = assigned.filter((issue) => !issue.completedAt);
  const countFor = (projectId) => {
    const forProject = assigned.filter((issue) => issue.projectId === projectId);
    return { openTasks: forProject.filter((issue) => !issue.completedAt).length, doneTasks: forProject.filter((issue) => issue.completedAt).length };
  };

  return {
    person: { ...user, skills: user.skills ?? [], workspaceRole: membership.role, membershipStatus: membership.status, joinedAt: membership.createdAt },
    structure: {
      headOf: headOf.map((department) => ({ id: department.id, name: department.name })),
      teams: teams.map((team) => ({ id: team.id, name: team.name, isLead: team.leadId === userId, department: team.department ? { id: team.department.id, name: team.department.name } : null })),
    },
    projects: projectMemberships
      .filter((row) => row.project)
      .map((row) => ({ ...row.project.toJSON(), role: row.role, viaTeam: row.viaTeam, ...countFor(row.projectId) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    stats: {
      openTasks: open.length,
      overdueTasks: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
      completedRecently: assigned.filter((issue) => issue.completedAt && new Date(issue.completedAt) >= since).length,
      completedTotal: assigned.length - open.length,
      minutesLoggedRecently: recentWork.reduce((total, row) => total + row.minutes, 0),
      commentsRecently: recentComments,
      recentDays: RECENT_DAYS,
    },
    activity,
    recentlyCompleted: completed,
  };
}
