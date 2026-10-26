import { Activity, Issue, Project, ProjectMember, Sprint, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { addDays, startOfDay, toDateOnly, toList } from '../../shared/utils/query.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const countWhere = (items, predicate) => items.filter(predicate).length;

export async function getProjectSummary(projectId, { days = 30 } = {}) {
  const [statuses, issues, members] = await Promise.all([
    Status.findAll({ where: { projectId }, order: [['position', 'ASC']] }),
    Issue.findAll({
      where: { projectId },
      attributes: ['id', 'type', 'priority', 'statusId', 'assigneeId', 'storyPoints', 'createdAt', 'completedAt', 'dueDate'],
    }),
    ProjectMember.findAll({ where: { projectId }, include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] }),
  ]);

  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const isDone = (issue) => categoryOf.get(issue.statusId) === 'done';
  const openIssues = issues.filter((issue) => !isDone(issue));
  const today = toDateOnly(new Date());

  const timeline = Array.from({ length: days }, (_, index) => {
    const day = startOfDay(addDays(new Date(), index - days + 1));
    const next = addDays(day, 1);
    const inDay = (date) => date && date >= day && date < next;
    return {
      date: toDateOnly(day),
      created: countWhere(issues, (issue) => inDay(issue.createdAt)),
      resolved: countWhere(issues, (issue) => isDone(issue) && inDay(issue.completedAt)),
    };
  });

  const windowStart = addDays(new Date(), -days);
  const recentlyDone = issues.filter((issue) => isDone(issue) && issue.completedAt && issue.completedAt >= windowStart);
  const averageCycleDays = recentlyDone.length
    ? recentlyDone.reduce((total, issue) => total + Math.max(0, issue.completedAt - issue.createdAt) / DAY_MS, 0) / recentlyDone.length
    : null;

  const workload = [
    ...members.map((member) => ({ user: member.user, issues: openIssues.filter((issue) => issue.assigneeId === member.userId) })),
    { user: null, issues: openIssues.filter((issue) => !issue.assigneeId) },
  ].map(({ user, issues: assigned }) => ({
    user,
    openCount: assigned.length,
    openPoints: assigned.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
  }));

  return {
    totals: {
      total: issues.length,
      open: openIssues.length,
      done: issues.length - openIssues.length,
      overdue: countWhere(openIssues, (issue) => issue.dueDate && issue.dueDate < today),
      completionRate: issues.length ? Math.round(((issues.length - openIssues.length) / issues.length) * 100) : 0,
      averageCycleDays: averageCycleDays === null ? null : Math.round(averageCycleDays * 10) / 10,
    },
    byStatus: statuses.map((status) => ({
      id: status.id,
      name: status.name,
      color: status.color,
      category: status.category,
      count: countWhere(issues, (issue) => issue.statusId === status.id),
    })),
    byType: ISSUE_TYPES.map((type) => ({ type, count: countWhere(issues, (issue) => issue.type === type) })),
    byPriority: ISSUE_PRIORITIES.map((priority) => ({ priority, count: countWhere(openIssues, (issue) => issue.priority === priority) })),
    workload: workload.filter((row) => row.user || row.openCount),
    timeline,
  };
}

const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);
const averageCycleDays = (issues) =>
  issues.length ? round1(issues.reduce((total, issue) => total + Math.max(0, issue.completedAt - issue.createdAt) / DAY_MS, 0) / issues.length) : null;
const percentChange = (current, previous) => (previous ? Math.round(((current - previous) / previous) * 100) : null);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Resolves which projects a report covers: the requested ones the user belongs to, or all their active projects. */
async function resolveReportProjects(userId, requestedIds) {
  const memberIds = await getMemberProjectIds(userId);
  if (requestedIds.length) {
    if (requestedIds.some((id) => !memberIds.includes(id))) throw ApiError.notFound('Project not found');
    return Project.findAll({ where: { id: requestedIds }, attributes: ['id', 'name', 'key', 'color', 'type'] });
  }
  return Project.findAll({ where: { id: memberIds, archivedAt: null }, attributes: ['id', 'name', 'key', 'color', 'type'], order: [['name', 'ASC']] });
}

/** Daily buckets for short periods, weekly buckets for longer ones, so the chart stays readable. */
function buildTimeline(issues, isDone, days) {
  const bucketDays = days > 45 ? 7 : 1;
  const buckets = Math.ceil(days / bucketDays);
  const firstDay = startOfDay(addDays(new Date(), -(buckets * bucketDays) + 1));
  return Array.from({ length: buckets }, (_, index) => {
    const start = addDays(firstDay, index * bucketDays);
    const end = addDays(start, bucketDays);
    const inBucket = (date) => date && date >= start && date < end;
    return {
      date: toDateOnly(start),
      bucket: bucketDays === 7 ? 'week' : 'day',
      created: countWhere(issues, (issue) => inBucket(issue.createdAt)),
      resolved: countWhere(issues, (issue) => isDone(issue) && inBucket(issue.completedAt)),
    };
  });
}

function buildInsights({ days, totals, byProject, workload, isAllProjects }) {
  const insights = [];
  const period = `the last ${days} days`;

  if (!totals.total) {
    return [{ tone: 'neutral', text: 'No tasks match these filters yet. Try a wider period or another project.' }];
  }

  const { createdInPeriod: created, completedInPeriod: completed } = totals;
  if (completed > created) {
    insights.push({ tone: 'positive', text: `The backlog is shrinking: ${plural(completed, 'issue')} completed vs. ${created} created in ${period}.` });
  } else if (created > completed) {
    insights.push({ tone: 'warning', text: `Work is piling up: ${plural(created, 'issue')} created vs. ${completed} completed in ${period}.` });
  } else if (created) {
    insights.push({ tone: 'neutral', text: `The team is keeping pace: ${created} created and ${completed} completed in ${period}.` });
  }

  if (totals.completedChange !== null && Math.abs(totals.completedChange) >= 10) {
    const faster = totals.completedChange > 0;
    insights.push({
      tone: faster ? 'positive' : 'warning',
      text: `Completed work is ${faster ? 'up' : 'down'} ${Math.abs(totals.completedChange)}% compared with the previous ${days} days.`,
    });
  }

  if (totals.overdue) {
    const worst = isAllProjects ? [...byProject].sort((a, b) => b.overdue - a.overdue)[0] : null;
    let where = '';
    if (worst?.overdue === totals.overdue) where = ` (${totals.overdue === 1 ? '' : 'all '}in ${worst.project.name})`;
    else if (worst?.overdue) where = `, most of them in ${worst.project.name} (${worst.overdue})`;
    insights.push({ tone: 'warning', text: `${plural(totals.overdue, 'open issue')} ${totals.overdue === 1 ? 'is' : 'are'} past the due date${where}.` });
  } else if (totals.open) {
    insights.push({ tone: 'positive', text: 'Nothing is overdue. Every open task is on schedule.' });
  }

  if (totals.dueSoon) insights.push({ tone: 'neutral', text: `${plural(totals.dueSoon, 'issue')} ${totals.dueSoon === 1 ? 'is' : 'are'} due in the next 7 days.` });

  const people = workload.filter((row) => row.user && row.open);
  if (people.length >= 2) {
    const [busiest] = [...people].sort((a, b) => b.open - a.open);
    const average = people.reduce((total, row) => total + row.open, 0) / people.length;
    if (busiest.open >= 3 && busiest.open >= average * 1.5) {
      insights.push({ tone: 'warning', text: `${busiest.user.name} has the most open work (${busiest.open} tasks, ${Math.round(busiest.open / average * 10) / 10}× the team average). Consider rebalancing.` });
    }
  }

  if (totals.unassigned) insights.push({ tone: 'neutral', text: `${plural(totals.unassigned, 'open issue')} ${totals.unassigned === 1 ? 'has' : 'have'} no assignee yet.` });

  if (totals.averageCycleDays !== null && totals.previousCycleDays !== null && totals.previousCycleDays > 0) {
    const change = Math.round(((totals.averageCycleDays - totals.previousCycleDays) / totals.previousCycleDays) * 100);
    if (Math.abs(change) >= 15) {
      insights.push({
        tone: change < 0 ? 'positive' : 'warning',
        text: `Tasks now take ${totals.averageCycleDays} days on average from creation to done, ${change < 0 ? 'faster' : 'slower'} than before (${totals.previousCycleDays} days).`,
      });
    }
  }

  return insights;
}

/**
 * Cross-project report for everything the user can see, narrowed by project, period, assignee, type and priority.
 * Period metrics compare the last `days` with the `days` before that.
 */
export async function getReportOverview(userId, filters) {
  const days = filters.days;
  const projects = await resolveReportProjects(userId, toList(filters.projectId));
  const projectIds = projects.map((project) => project.id);
  const isAllProjects = !toList(filters.projectId).length;

  const where = { projectId: projectIds };
  if (toList(filters.type).length) where.type = toList(filters.type);
  if (toList(filters.priority).length) where.priority = toList(filters.priority);
  if (filters.assigneeId === 'unassigned') where.assigneeId = null;
  else if (filters.assigneeId) where.assigneeId = filters.assigneeId === 'me' ? userId : filters.assigneeId;

  const [statuses, issues, members] = await Promise.all([
    Status.findAll({ where: { projectId: projectIds }, order: [['position', 'ASC']] }),
    projectIds.length
      ? Issue.findAll({
          where,
          attributes: ['id', 'projectId', 'type', 'priority', 'statusId', 'assigneeId', 'storyPoints', 'createdAt', 'completedAt', 'dueDate'],
        })
      : [],
    ProjectMember.findAll({ where: { projectId: projectIds }, include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] }),
  ]);

  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const isDone = (issue) => categoryOf.get(issue.statusId) === 'done';
  const today = toDateOnly(new Date());
  const inAWeek = toDateOnly(addDays(new Date(), 7));
  const periodStart = addDays(new Date(), -days);
  const previousStart = addDays(new Date(), -2 * days);
  const inPeriod = (date) => date && date >= periodStart;
  const inPrevious = (date) => date && date >= previousStart && date < periodStart;

  const summarize = (list) => {
    const open = list.filter((issue) => !isDone(issue));
    const completed = list.filter((issue) => isDone(issue) && inPeriod(issue.completedAt));
    return {
      total: list.length,
      open: open.length,
      done: list.length - open.length,
      overdue: countWhere(open, (issue) => issue.dueDate && issue.dueDate < today),
      completedInPeriod: completed.length,
      completionRate: list.length ? Math.round(((list.length - open.length) / list.length) * 100) : 0,
      averageCycleDays: averageCycleDays(completed),
      openList: open,
    };
  };

  const all = summarize(issues);
  const createdInPeriod = countWhere(issues, (issue) => inPeriod(issue.createdAt));
  const createdPrevious = countWhere(issues, (issue) => inPrevious(issue.createdAt));
  const completedPreviousList = issues.filter((issue) => isDone(issue) && inPrevious(issue.completedAt));

  const totals = {
    total: all.total,
    open: all.open,
    done: all.done,
    overdue: all.overdue,
    dueSoon: countWhere(all.openList, (issue) => issue.dueDate && issue.dueDate >= today && issue.dueDate <= inAWeek),
    unassigned: countWhere(all.openList, (issue) => !issue.assigneeId),
    completionRate: all.completionRate,
    createdInPeriod,
    completedInPeriod: all.completedInPeriod,
    createdChange: percentChange(createdInPeriod, createdPrevious),
    completedChange: percentChange(all.completedInPeriod, completedPreviousList.length),
    averageCycleDays: all.averageCycleDays,
    previousCycleDays: averageCycleDays(completedPreviousList),
    openPoints: all.openList.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
  };

  const byProject = projects.map((project) => {
    const { openList: _open, ...stats } = summarize(issues.filter((issue) => issue.projectId === project.id));
    return { project, ...stats };
  });

  const people = new Map();
  members.forEach((member) => people.set(member.userId, member.user));
  const workload = [...people.values(), null]
    .map((user) => {
      const assigned = issues.filter((issue) => (user ? issue.assigneeId === user.id : !issue.assigneeId));
      const open = assigned.filter((issue) => !isDone(issue));
      return {
        user,
        open: open.length,
        openPoints: open.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
        overdue: countWhere(open, (issue) => issue.dueDate && issue.dueDate < today),
        completedInPeriod: countWhere(assigned, (issue) => isDone(issue) && inPeriod(issue.completedAt)),
      };
    })
    .filter((row) => row.open || row.completedInPeriod || (row.user && !filters.assigneeId))
    .sort((a, b) => Number(!a.user) - Number(!b.user) || b.open - a.open || b.completedInPeriod - a.completedInPeriod);

  const categoryCounts = ['todo', 'in_progress', 'done'].map((category) => ({
    category,
    count: countWhere(issues, (issue) => categoryOf.get(issue.statusId) === category),
  }));

  return {
    period: { days, from: toDateOnly(periodStart), to: today },
    projects: projects.map((project) => project.toJSON()),
    totals,
    timeline: buildTimeline(issues, isDone, days),
    byStatusCategory: categoryCounts,
    byStatus:
      projects.length === 1
        ? statuses.map((status) => ({ id: status.id, name: status.name, color: status.color, category: status.category, count: countWhere(issues, (issue) => issue.statusId === status.id) }))
        : [],
    byType: ISSUE_TYPES.map((type) => ({ type, count: countWhere(issues, (issue) => issue.type === type) })).filter((row) => row.count),
    byPriority: ISSUE_PRIORITIES.map((priority) => ({ priority, count: countWhere(all.openList, (issue) => issue.priority === priority) })),
    byProject,
    workload,
    insights: buildInsights({ days, totals, byProject, workload, isAllProjects }),
  };
}

const COMPLETION_MILESTONES = [25, 50, 75, 100];

/** Average days each issue spent in a status, rebuilt from the status-change history. */
function measureStages(statuses, issues, statusChanges, isDone) {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const changesByIssue = new Map();
  for (const change of statusChanges) {
    if (!issueById.has(change.issueId)) continue;
    if (!changesByIssue.has(change.issueId)) changesByIssue.set(change.issueId, []);
    changesByIssue.get(change.issueId).push(change);
  }

  const spent = new Map();
  const record = (name, days) => {
    const entry = spent.get(name) ?? { total: 0, passes: 0 };
    entry.total += days;
    entry.passes += 1;
    spent.set(name, entry);
  };
  const enteredCurrentAt = new Map();
  for (const issue of issues) {
    let enteredAt = issue.createdAt;
    for (const change of changesByIssue.get(issue.id) ?? []) {
      if (change.fromValue) record(change.fromValue, Math.max(0, change.createdAt - enteredAt) / DAY_MS);
      enteredAt = change.createdAt;
    }
    enteredCurrentAt.set(issue.id, enteredAt);
  }

  const now = new Date();
  return statuses.map((status) => {
    const here = issues.filter((issue) => issue.statusId === status.id);
    const ages = here.filter((issue) => !isDone(issue)).map((issue) => (now - enteredCurrentAt.get(issue.id)) / DAY_MS);
    const history = spent.get(status.name);
    return {
      id: status.id,
      name: status.name,
      color: status.color,
      category: status.category,
      wipLimit: status.wipLimit,
      count: here.length,
      points: here.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
      averageDaysSpent: history ? round1(history.total / history.passes) : null,
      passes: history?.passes ?? 0,
      currentAverageAgeDays: ages.length ? round1(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
    };
  });
}

/**
 * The life of a project from creation until today: completion, scope vs. done over time,
 * how work flows through each workflow stage, a forecast, and dated milestones.
 */
export async function getProjectProgress(projectId) {
  const project = await Project.findByPk(projectId, { include: [{ model: User, as: 'lead', attributes: USER_SUMMARY_ATTRIBUTES }] });
  if (!project) throw ApiError.notFound('Project not found');

  const [statuses, issues, sprints, statusChanges] = await Promise.all([
    Status.findAll({ where: { projectId }, order: [['position', 'ASC']] }),
    Issue.findAll({ where: { projectId }, attributes: ['id', 'statusId', 'storyPoints', 'createdAt', 'completedAt'] }),
    Sprint.findAll({ where: { projectId }, order: [['createdAt', 'ASC']] }),
    Activity.findAll({
      where: { projectId, action: 'updated', field: 'status' },
      attributes: ['issueId', 'fromValue', 'toValue', 'createdAt'],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const isDone = (issue) => categoryOf.get(issue.statusId) === 'done';
  const done = issues.filter(isDone);
  const pointsOf = (list) => list.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
  const now = new Date();
  // Imported or seeded projects can hold work older than the project row itself.
  const startedAt = new Date(
    Math.min(
      project.createdAt.getTime(),
      ...issues.map((issue) => issue.createdAt.getTime()),
      ...sprints.filter((sprint) => sprint.startDate).map((sprint) => new Date(`${sprint.startDate}T00:00:00`).getTime()),
    ),
  );
  const ageDays = Math.max(0, Math.floor((startOfDay(now) - startOfDay(startedAt)) / DAY_MS));

  const totals = {
    issues: issues.length,
    done: done.length,
    open: issues.length - done.length,
    points: pointsOf(issues),
    donePoints: pointsOf(done),
    completion: issues.length ? Math.round((done.length / issues.length) * 100) : 0,
    pointsCompletion: pointsOf(issues) ? Math.round((pointsOf(done) / pointsOf(issues)) * 100) : null,
    averageLeadTimeDays: averageCycleDays(done.filter((issue) => issue.completedAt)),
  };

  // Scope vs. completed since creation (daily for young projects, weekly afterwards).
  const bucketDays = ageDays > 60 ? 7 : 1;
  const firstDay = startOfDay(startedAt);
  const bucketCount = Math.floor(ageDays / bucketDays) + 1;
  const burnup = Array.from({ length: bucketCount }, (_, index) => {
    const end = index === bucketCount - 1 ? addDays(startOfDay(now), 1) : addDays(firstDay, (index + 1) * bucketDays);
    const scope = issues.filter((issue) => issue.createdAt < end);
    const completed = done.filter((issue) => issue.completedAt && issue.completedAt < end);
    return {
      date: toDateOnly(addDays(firstDay, index * bucketDays)),
      bucket: bucketDays === 7 ? 'week' : 'day',
      scope: scope.length,
      completed: completed.length,
      scopePoints: pointsOf(scope),
      completedPoints: pointsOf(completed),
    };
  });

  // Forecast from the last 4 weeks of throughput and scope growth.
  const windowStart = addDays(now, -28);
  const recentDone = done.filter((issue) => issue.completedAt && issue.completedAt >= windowStart).length;
  const recentCreated = issues.filter((issue) => issue.createdAt >= windowStart).length;
  const weeks = Math.min(4, Math.max(1, ageDays / 7));
  const perWeek = round1(recentDone / weeks);
  const scopePerWeek = round1(recentCreated / weeks);
  let forecast;
  if (!issues.length) forecast = { state: 'no_data', perWeek, scopePerWeek, estimatedDate: null, weeksLeft: null };
  else if (!totals.open) forecast = { state: 'complete', perWeek, scopePerWeek, estimatedDate: toDateOnly(done.at(-1)?.completedAt ?? now), weeksLeft: 0 };
  else if (!perWeek) forecast = { state: 'stalled', perWeek, scopePerWeek, estimatedDate: null, weeksLeft: null };
  else {
    const weeksLeft = Math.ceil((totals.open / perWeek) * 10) / 10;
    forecast = {
      state: scopePerWeek > perWeek ? 'at_risk' : 'on_track',
      perWeek,
      scopePerWeek,
      weeksLeft,
      estimatedDate: toDateOnly(addDays(now, Math.ceil(weeksLeft * 7))),
    };
  }

  // Dated milestones from creation onwards.
  const milestones = [
    {
      date: startedAt,
      kind: 'created',
      title: project.createdAt.getTime() === startedAt.getTime() ? 'Project created' : 'Work started',
      detail: project.lead ? `Led by ${project.lead.name}` : null,
    },
  ];
  const firstDone = [...done].filter((issue) => issue.completedAt).sort((a, b) => a.completedAt - b.completedAt)[0];
  if (firstDone) milestones.push({ date: firstDone.completedAt, kind: 'first_done', title: 'First task completed', detail: null });
  for (const sprint of sprints) {
    if (sprint.startDate && sprint.state !== 'planned') {
      milestones.push({ date: new Date(`${sprint.startDate}T09:00:00`), kind: 'sprint_started', title: `${sprint.name} started`, detail: sprint.goal || null });
    }
    if (sprint.completedAt) {
      const summary = sprint.summary ?? {};
      const detail = summary.totalPoints ? `${summary.donePoints ?? 0} of ${summary.totalPoints} points done` : summary.issueCount ? `${summary.doneCount ?? 0} of ${summary.issueCount} tasks done` : null;
      milestones.push({ date: sprint.completedAt, kind: 'sprint_completed', title: `${sprint.name} completed`, detail });
    }
  }
  const timelineEvents = [
    ...issues.map((issue) => ({ at: issue.createdAt, scope: 1, done: 0 })),
    ...done.filter((issue) => issue.completedAt).map((issue) => ({ at: issue.completedAt, scope: 0, done: 1 })),
  ].sort((a, b) => a.at - b.at);
  let scopeSoFar = 0;
  let doneSoFar = 0;
  const reached = new Set();
  for (const event of timelineEvents) {
    scopeSoFar += event.scope;
    doneSoFar += event.done;
    if (!event.done || scopeSoFar < 4) continue;
    const percent = (doneSoFar / scopeSoFar) * 100;
    for (const threshold of COMPLETION_MILESTONES) {
      if (percent >= threshold && !reached.has(threshold)) {
        reached.add(threshold);
        milestones.push({
          date: event.at,
          kind: threshold === 100 ? 'completed' : 'progress',
          title: threshold === 100 ? 'All tasks completed' : `${threshold}% of tasks done`,
          detail: `${doneSoFar} of ${scopeSoFar} tasks at the time`,
        });
      }
    }
  }
  milestones.sort((a, b) => a.date - b.date);
  milestones.push({ date: now, kind: 'today', title: 'Today', detail: `${totals.completion}% complete · ${totals.open} open` });

  return {
    project: { id: project.id, name: project.name, key: project.key, color: project.color, type: project.type, lead: project.lead, createdAt: startedAt },
    ageDays,
    totals,
    burnup,
    stages: measureStages(statuses, issues, statusChanges, isDone),
    forecast,
    milestones: milestones.map((milestone) => ({ ...milestone, date: milestone.date.toISOString() })),
  };
}

export async function getSprintBurndown(projectId, sprintId) {
  const sprint = await Sprint.findOne({ where: { id: sprintId, projectId } });
  if (!sprint) throw ApiError.notFound('Sprint not found');

  const issues = await Issue.findAll({
    where: { sprintId },
    attributes: ['id', 'storyPoints', 'completedAt'],
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });
  const totalPoints = issues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
  const unit = totalPoints > 0 ? 'points' : 'issues';
  const valueOf = (issue) => (unit === 'points' ? issue.storyPoints ?? 0 : 1);
  const total = unit === 'points' ? totalPoints : issues.length;

  const start = startOfDay(sprint.startDate ? new Date(`${sprint.startDate}T00:00:00`) : sprint.createdAt);
  const end = startOfDay(sprint.endDate ? new Date(`${sprint.endDate}T00:00:00`) : addDays(start, 14));
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const today = startOfDay(new Date());

  const points = Array.from({ length: totalDays + 1 }, (_, index) => {
    const day = addDays(start, index);
    const endOfDay = addDays(day, 1);
    const completed = issues
      .filter((issue) => issue.status.category === 'done' && issue.completedAt && issue.completedAt < endOfDay)
      .reduce((sum, issue) => sum + valueOf(issue), 0);
    return {
      date: toDateOnly(day),
      ideal: Math.round((total - (total / totalDays) * index) * 10) / 10,
      remaining: day <= today ? total - completed : null,
    };
  });

  return { sprint, unit, total, points };
}

export async function getVelocity(projectId, { limit = 8 } = {}) {
  const sprints = await Sprint.findAll({
    where: { projectId, state: 'completed' },
    order: [['completedAt', 'DESC']],
    limit,
  });
  const rows = sprints.reverse().map((sprint) => ({
    sprintId: sprint.id,
    name: sprint.name,
    committed: sprint.summary?.totalPoints ?? 0,
    completed: sprint.summary?.donePoints ?? 0,
    completedIssues: sprint.summary?.doneCount ?? 0,
  }));
  const average = rows.length ? Math.round(rows.reduce((total, row) => total + row.completed, 0) / rows.length) : 0;
  return { sprints: rows, averageVelocity: average };
}
