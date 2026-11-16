import { Op } from 'sequelize';
import { Issue, Meeting, MeetingParticipant, ProjectMember, Sprint, StandupUpdate, Status, User } from '../../database/models.js';
import { addDays, toDateOnly } from '../../shared/utils/query.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { listProjectsActivity } from '../activity/activity.service.js';
import { listMyWork } from '../issues/issue.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { listProjects } from '../projects/project.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

async function activeSprintProgress(projectIds) {
  const sprints = await Sprint.findAll({ where: { projectId: projectIds, state: 'active' } });
  if (!sprints.length) return [];
  const issues = await Issue.findAll({
    where: { sprintId: sprints.map((sprint) => sprint.id) },
    attributes: ['sprintId', 'storyPoints'],
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });
  return sprints.map((sprint) => {
    const sprintIssues = issues.filter((issue) => issue.sprintId === sprint.id);
    const done = sprintIssues.filter((issue) => issue.status.category === 'done');
    return {
      ...sprint.toJSON(),
      issueCount: sprintIssues.length,
      doneCount: done.length,
      totalPoints: sprintIssues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
      donePoints: done.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
    };
  });
}

/** Projects where the person still needs to post today's standup (chat on the plan). */
async function standupPendingFor(userId, projects) {
  if (!projects.length) return [];
  const user = await User.findByPk(userId, { attributes: ['timezone'] });
  const today = localDateTime(user?.timezone ?? 'UTC').date;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];

  const pending = [];
  for (const project of projects) {
    if (!(await projectHasFeature(project.id, 'chat'))) continue;
    const membership = await ProjectMember.findOne({ where: { projectId: project.id, userId }, attributes: ['role'] });
    if (!membership || membership.role === 'viewer') continue;
    const posted = await StandupUpdate.findOne({ where: { projectId: project.id, userId, date: today }, attributes: ['id'] });
    if (!posted) pending.push({ projectId: project.id, projectName: project.name, projectColor: project.color, date: today });
  }
  return pending;
}

/**
 * Recent ended meetings with open action items (not yet turned into tasks) the person was in.
 * Used on Home so follow-ups do not die in the recap.
 */
async function openMeetingActions(userId, organizationId) {
  const participated = await MeetingParticipant.findAll({ where: { userId }, attributes: ['meetingId'], raw: true });
  const ids = participated.map((row) => row.meetingId);
  if (!ids.length) return [];
  const meetings = await Meeting.findAll({
    where: {
      id: ids,
      organizationId,
      status: 'ended',
      summary: { [Op.ne]: null },
    },
    attributes: ['id', 'title', 'endedAt', 'summary', 'contextType', 'contextId'],
    order: [['endedAt', 'DESC']],
    limit: 40,
  });
  return meetings
    .map((meeting) => {
      const items = (meeting.summary?.actionItems ?? []).filter((item) => item?.text && !item.issue);
      if (!items.length) return null;
      return {
        meetingId: meeting.id,
        title: meeting.title,
        endedAt: meeting.endedAt,
        openCount: items.length,
        preview: items.slice(0, 3).map((item) => item.text),
        contextType: meeting.contextType,
        contextId: meeting.contextId,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Cross-project standup rollup for project admins: who posted today, who has blockers.
 */
async function standupRollupFor(userId, projects) {
  const adminProjects = [];
  for (const project of projects) {
    if (!(await projectHasFeature(project.id, 'chat'))) continue;
    const membership = await ProjectMember.findOne({ where: { projectId: project.id, userId, role: 'admin' }, attributes: ['id'] });
    if (membership) adminProjects.push(project);
  }
  if (!adminProjects.length) return [];

  const user = await User.findByPk(userId, { attributes: ['timezone'] });
  const today = localDateTime(user?.timezone ?? 'UTC').date;

  const rollup = [];
  for (const project of adminProjects) {
    const [members, updates] = await Promise.all([
      ProjectMember.findAll({
        where: { projectId: project.id, role: { [Op.ne]: 'viewer' } },
        include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status'] }],
      }),
      StandupUpdate.findAll({
        where: { projectId: project.id, date: today },
        include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
      }),
    ]);
    const active = members.filter((row) => row.user && row.user.status !== 'disabled');
    const postedIds = new Set(updates.map((row) => row.userId));
    const blockers = updates.filter((row) => (row.blockers ?? '').trim()).map((row) => ({
      user: row.user?.toJSON?.() ?? row.user,
      blockers: row.blockers,
    }));
    rollup.push({
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      date: today,
      posted: postedIds.size,
      expected: active.length,
      missing: active.filter((row) => !postedIds.has(row.userId)).map((row) => row.user.toJSON()),
      blockers,
    });
  }
  return rollup;
}

export async function getDashboard(userId) {
  const projectIds = await getMemberProjectIds(userId);
  const [myWork, projects, recentActivity, sprints] = await Promise.all([
    listMyWork(userId),
    listProjects(userId, { includeArchived: false }),
    listProjectsActivity(projectIds, 20),
    activeSprintProgress(projectIds),
  ]);

  const today = toDateOnly(new Date());
  const weekEnd = toDateOnly(addDays(new Date(), 7));
  const weekAgo = addDays(new Date(), -7);
  const open = myWork.filter((issue) => issue.status.category !== 'done');

  const organizationId = projects[0]?.organizationId ?? null;
  const [standupPending, meetingActions, standupRollup] = await Promise.all([
    standupPendingFor(userId, projects),
    organizationId ? openMeetingActions(userId, organizationId) : Promise.resolve([]),
    standupRollupFor(userId, projects),
  ]);

  return {
    stats: {
      open: open.length,
      inProgress: open.filter((issue) => issue.status.category === 'in_progress').length,
      overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
      dueToday: open.filter((issue) => issue.dueDate === today).length,
      dueThisWeek: open.filter((issue) => issue.dueDate && issue.dueDate >= today && issue.dueDate <= weekEnd).length,
      completedThisWeek: myWork.filter((issue) => issue.completedAt && new Date(issue.completedAt) >= weekAgo).length,
    },
    myWork,
    projects,
    activeSprints: sprints.map((sprint) => ({ ...sprint, project: projects.find((project) => project.id === sprint.projectId) ?? null })),
    recentActivity,
    standupPending,
    meetingActions,
    standupRollup,
  };
}
