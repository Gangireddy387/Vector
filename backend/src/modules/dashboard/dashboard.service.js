import { Op } from 'sequelize';
import {
  Issue,
  Meeting,
  MeetingParticipant,
  OrganizationMember,
  ProjectMember,
  Sprint,
  StandupUpdate,
  Status,
  User,
} from '../../database/models.js';
import { addDays, toDateOnly } from '../../shared/utils/query.js';
import { addDaysToDate, localDateTime } from '../../shared/utils/timezone.js';
import { listProjectsActivity } from '../activity/activity.service.js';
import { listMyWork } from '../issues/issue.service.js';
import { WORKDAY_NUDGE_DAYS } from '../notifications/workday-nudge.constants.js';
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
export async function standupPendingFor(userId, projects) {
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

/** Projects the person leads or admins (for rollup / pulse / density). */
async function leadProjectsFor(userId, projects) {
  const leadProjects = [];
  for (const project of projects) {
    const isLead = project.leadId === userId;
    const membership = await ProjectMember.findOne({ where: { projectId: project.id, userId }, attributes: ['role'] });
    if (isLead || membership?.role === 'admin') leadProjects.push(project);
  }
  return leadProjects;
}

/**
 * Cross-project standup rollup for project admins and project leads: who posted today, who is missing, blockers.
 */
async function standupRollupFor(userId, projects) {
  const leadProjects = [];
  for (const project of projects) {
    if (!(await projectHasFeature(project.id, 'chat'))) continue;
    const isLead = project.leadId === userId;
    const membership = await ProjectMember.findOne({ where: { projectId: project.id, userId }, attributes: ['role'] });
    if (isLead || membership?.role === 'admin') leadProjects.push(project);
  }
  if (!leadProjects.length) return [];

  const user = await User.findByPk(userId, { attributes: ['timezone'] });
  const today = localDateTime(user?.timezone ?? 'UTC').date;

  const rollup = [];
  for (const project of leadProjects) {
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
    const blockers = updates
      .filter((row) => (row.blockers ?? '').trim())
      .map((row) => ({
        user: row.user?.toJSON?.() ?? row.user,
        blockers: row.blockers,
      }));
    const postedPeople = updates.filter((row) => row.user).map((row) => row.user.toJSON?.() ?? row.user);
    rollup.push({
      projectId: project.id,
      projectName: project.name,
      projectKey: project.key,
      projectColor: project.color,
      date: today,
      posted: postedIds.size,
      expected: active.length,
      missing: active.filter((row) => !postedIds.has(row.userId)).map((row) => row.user.toJSON()),
      postedPeople,
      blockers,
    });
  }
  return rollup.sort(
    (a, b) => b.blockers.length - a.blockers.length || b.missing.length - a.missing.length || a.projectName.localeCompare(b.projectName),
  );
}

/** Thin projects (< 3 members) the person can invite into. */
async function densityHintsFor(userId, projects) {
  const leadProjects = await leadProjectsFor(userId, projects);
  return leadProjects
    .filter((project) => (project.memberCount ?? 0) < 3)
    .map((project) => ({
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      memberCount: project.memberCount ?? 0,
    }))
    .slice(0, 4);
}

/** Last N weekdays ending at `today` (YYYY-MM-DD). */
function recentWeekdays(today, count = 5) {
  const dates = [];
  let cursor = today;
  while (dates.length < count) {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor);
    cursor = addDaysToDate(cursor, -1);
  }
  return dates;
}

/**
 * Weekly team pulse for leads/admins: standup completion %, tasks closed, open meeting actions.
 */
async function weeklyPulseFor(userId, projects, meetingActions) {
  const leadProjects = await leadProjectsFor(userId, projects);
  if (!leadProjects.length) return null;

  const user = await User.findByPk(userId, { attributes: ['timezone'] });
  const today = localDateTime(user?.timezone ?? 'UTC').date;
  const weekdays = recentWeekdays(today, 5);
  const weekStart = weekdays[weekdays.length - 1];
  const weekAgo = addDays(new Date(`${today}T12:00:00Z`), -7);
  const projectIds = leadProjects.map((project) => project.id);

  let standupPosted = 0;
  let standupExpected = 0;
  for (const project of leadProjects) {
    if (!(await projectHasFeature(project.id, 'chat'))) continue;
    const members = await ProjectMember.findAll({
      where: { projectId: project.id, role: { [Op.ne]: 'viewer' } },
      include: [{ model: User, as: 'user', attributes: ['id', 'status'] }],
    });
    const active = members.filter((row) => row.user && row.user.status !== 'disabled');
    const updates = await StandupUpdate.findAll({
      where: { projectId: project.id, date: { [Op.in]: weekdays } },
      attributes: ['userId', 'date'],
    });
    const postedPairs = new Set(updates.map((row) => `${row.userId}:${row.date}`));
    standupExpected += active.length * weekdays.length;
    for (const member of active) {
      for (const date of weekdays) {
        if (postedPairs.has(`${member.userId}:${date}`)) standupPosted += 1;
      }
    }
  }

  const closed = await Issue.count({
    where: {
      projectId: projectIds,
      completedAt: { [Op.gte]: weekAgo },
    },
  });

  const meetingActionsOpen = meetingActions.reduce((sum, item) => sum + item.openCount, 0);
  const standupPct = standupExpected ? Math.round((standupPosted / standupExpected) * 100) : null;

  return {
    weekStart,
    weekEnd: today,
    standupPct,
    standupPosted,
    standupExpected,
    tasksClosed: closed,
    meetingActionsOpen,
    projectCount: leadProjects.length,
  };
}

/** In-app habit banner when the person is on membership day 2 or 7 and still has workday work. */
async function habitNudgeFor(userId, standupPending, stats) {
  const user = await User.findByPk(userId, { attributes: ['timezone', 'preferences'] });
  if (!user) return null;
  const local = localDateTime(user.timezone);
  const membership = await OrganizationMember.findOne({
    where: { userId, status: 'active' },
    order: [['createdAt', 'ASC']],
    attributes: ['createdAt'],
  });
  if (!membership) return null;
  const joinedOn = localDateTime(user.timezone, membership.createdAt).date;
  const day =
    Math.round(
      (new Date(`${local.date}T12:00:00Z`).getTime() - new Date(`${joinedOn}T12:00:00Z`).getTime()) / 86_400_000,
    );
  if (!WORKDAY_NUDGE_DAYS.includes(day)) return null;

  const reasons = [];
  if (standupPending.length) reasons.push('standup');
  if (stats.overdue) reasons.push('overdue');
  if (stats.dueToday) reasons.push('dueToday');
  if (!reasons.length) return null;

  return {
    day,
    title: day === 2 ? 'Day 2 — Start my day' : 'Day 7 — Keep the loop going',
    reasons,
    standupPending: standupPending.slice(0, 1),
  };
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

  const stats = {
    open: open.length,
    inProgress: open.filter((issue) => issue.status.category === 'in_progress').length,
    overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
    dueToday: open.filter((issue) => issue.dueDate === today).length,
    dueThisWeek: open.filter((issue) => issue.dueDate && issue.dueDate >= today && issue.dueDate <= weekEnd).length,
    completedThisWeek: myWork.filter((issue) => issue.completedAt && new Date(issue.completedAt) >= weekAgo).length,
  };

  const [densityHints, weeklyPulse, habitNudge] = await Promise.all([
    densityHintsFor(userId, projects),
    weeklyPulseFor(userId, projects, meetingActions),
    habitNudgeFor(userId, standupPending, stats),
  ]);

  return {
    stats,
    myWork,
    projects,
    activeSprints: sprints.map((sprint) => ({ ...sprint, project: projects.find((project) => project.id === sprint.projectId) ?? null })),
    recentActivity,
    standupPending,
    meetingActions,
    standupRollup,
    densityHints,
    weeklyPulse,
    habitNudge,
  };
}
