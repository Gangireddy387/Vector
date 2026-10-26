import { Op } from 'sequelize';
import { Activity, Comment, Issue, Project, ProjectMember, Sprint, Status, User, WorkLog } from '../../database/models.js';
import { currentOrganizationId, currentOrganizationRole } from '../../shared/context/request-context.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { addDays, startOfDay, toDateOnly, toList } from '../../shared/utils/query.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUE_ATTRIBUTES = [
  'id', 'projectId', 'key', 'title', 'type', 'priority', 'statusId', 'assigneeId', 'reporterId',
  'parentId', 'sprintId', 'storyPoints', 'startDate', 'dueDate', 'createdAt', 'completedAt',
];
const PROJECT_ATTRIBUTES = ['id', 'name', 'key', 'color', 'type'];

const round1 = (value) => (value === null || value === undefined || Number.isNaN(value) ? null : Math.round(value * 10) / 10);
const pointsOf = (list) => list.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const average = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null);
const dateOnlyToDate = (value) => new Date(`${value}T00:00:00`);

async function loadUsers(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await User.findAll({ where: { id: unique }, attributes: USER_SUMMARY_ATTRIBUTES });
  return new Map(users.map((user) => [user.id, user.toJSON()]));
}

/** Who worked on a set of issues, busiest first. */
function contributorsOf(work, isDone, users) {
  const byUser = new Map();
  for (const issue of work) {
    if (!issue.assigneeId) continue;
    const row = byUser.get(issue.assigneeId) ?? { user: users.get(issue.assigneeId) ?? null, total: 0, done: 0, points: 0, donePoints: 0 };
    row.total += 1;
    row.points += issue.storyPoints ?? 0;
    if (isDone(issue)) {
      row.done += 1;
      row.donePoints += issue.storyPoints ?? 0;
    }
    byUser.set(issue.assigneeId, row);
  }
  return [...byUser.values()].filter((row) => row.user).sort((a, b) => b.done - a.done || b.total - a.total);
}

function summarizeWork(work, categoryOf, today) {
  const done = work.filter((issue) => categoryOf(issue) === 'done');
  const open = work.filter((issue) => categoryOf(issue) !== 'done');
  const finishedAt = done.length && done.length === work.length ? new Date(Math.max(...done.map((issue) => (issue.completedAt ?? issue.createdAt).getTime()))) : null;
  return {
    total: work.length,
    done: done.length,
    inProgress: work.filter((issue) => categoryOf(issue) === 'in_progress').length,
    todo: work.filter((issue) => categoryOf(issue) === 'todo').length,
    points: pointsOf(work),
    donePoints: pointsOf(done),
    completion: percent(done.length, work.length) ?? 0,
    overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
    startedAt: work.length ? new Date(Math.min(...work.map((issue) => issue.createdAt.getTime()))).toISOString() : null,
    finishedAt: finishedAt?.toISOString() ?? null,
  };
}

async function loadProjectWork(projectId) {
  const [statuses, issues] = await Promise.all([
    Status.findAll({ where: { projectId }, attributes: ['id', 'name', 'color', 'category'] }),
    Issue.findAll({ where: { projectId }, attributes: ISSUE_ATTRIBUTES }),
  ]);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const categoryOf = (issue) => statusById.get(issue.statusId)?.category;
  return { statusById, issues, categoryOf, isDone: (issue) => categoryOf(issue) === 'done' };
}

/**
 * Module (epic) tracking: every epic with the progress of all work beneath it, who is working on it,
 * and whether it will land by its due date. Work that belongs to no epic is grouped as "unplanned".
 */
export async function getProjectModules(projectId) {
  const { statusById, issues, categoryOf, isDone } = await loadProjectWork(projectId);
  const users = await loadUsers(issues.map((issue) => issue.assigneeId));
  const today = toDateOnly(new Date());
  const inAWeek = toDateOnly(addDays(new Date(), 7));

  const childrenOf = new Map();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    if (!childrenOf.has(issue.parentId)) childrenOf.set(issue.parentId, []);
    childrenOf.get(issue.parentId).push(issue);
  }
  const descendantsOf = (rootId) => {
    const found = new Map();
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length) {
      const issue = stack.pop();
      if (found.has(issue.id)) continue;
      found.set(issue.id, issue);
      stack.push(...(childrenOf.get(issue.id) ?? []));
    }
    return [...found.values()];
  };

  const inModule = new Set();
  const modules = issues
    .filter((issue) => issue.type === 'epic')
    .map((epic) => {
      const work = descendantsOf(epic.id).filter((issue) => issue.type !== 'epic');
      work.forEach((issue) => inModule.add(issue.id));
      const stats = summarizeWork(work, categoryOf, today);
      const status = statusById.get(epic.statusId);
      let health;
      if (!work.length) health = isDone(epic) ? 'done' : 'empty';
      else if (stats.done === stats.total) health = 'done';
      else if (epic.dueDate && epic.dueDate < today) health = 'overdue';
      else if (epic.dueDate && epic.dueDate <= inAWeek && stats.completion < 80) health = 'at_risk';
      else if (!stats.done && !stats.inProgress) health = 'not_started';
      else health = 'on_track';
      return {
        id: epic.id,
        key: epic.key,
        title: epic.title,
        status: status ? { name: status.name, color: status.color, category: status.category } : null,
        owner: users.get(epic.assigneeId) ?? null,
        startDate: epic.startDate,
        dueDate: epic.dueDate,
        createdAt: epic.createdAt.toISOString(),
        health,
        ...stats,
        contributors: contributorsOf(work, isDone, users),
      };
    });

  const unplannedWork = issues.filter((issue) => issue.type !== 'epic' && !inModule.has(issue.id));
  const unplanned = unplannedWork.length
    ? { ...summarizeWork(unplannedWork, categoryOf, today), contributors: contributorsOf(unplannedWork, isDone, users) }
    : null;

  return {
    modules,
    unplanned,
    totals: {
      modules: modules.length,
      done: modules.filter((module) => module.health === 'done').length,
      atRisk: modules.filter((module) => module.health === 'at_risk').length,
      overdue: modules.filter((module) => module.health === 'overdue').length,
    },
  };
}

/**
 * Sprint-by-sprint history: what each sprint committed to, what it delivered, what carried over,
 * and who delivered it. Completed sprints use the snapshot taken when they closed.
 */
export async function getProjectSprints(projectId) {
  const [{ issues, categoryOf, isDone }, sprints] = await Promise.all([
    loadProjectWork(projectId),
    Sprint.findAll({ where: { projectId }, order: [['createdAt', 'ASC']] }),
  ]);
  const users = await loadUsers(issues.map((issue) => issue.assigneeId));
  const today = toDateOnly(new Date());

  const rows = sprints.map((sprint) => {
    const work = issues.filter((issue) => issue.sprintId === sprint.id);
    const done = work.filter(isDone);
    const isCompleted = sprint.state === 'completed';
    const summary = sprint.summary ?? {};
    const committed = isCompleted ? summary.issueCount ?? work.length : work.length;
    const delivered = isCompleted ? summary.doneCount ?? done.length : done.length;
    const committedPoints = isCompleted ? summary.totalPoints ?? pointsOf(work) : pointsOf(work);
    const deliveredPoints = isCompleted ? summary.donePoints ?? pointsOf(done) : pointsOf(done);
    const durationDays = sprint.startDate && sprint.endDate ? Math.round((dateOnlyToDate(sprint.endDate) - dateOnlyToDate(sprint.startDate)) / DAY_MS) : null;
    const elapsedDays = sprint.state === 'active' && sprint.startDate ? Math.max(0, Math.round((startOfDay() - dateOnlyToDate(sprint.startDate)) / DAY_MS)) : null;
    return {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      state: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      completedAt: sprint.completedAt?.toISOString() ?? null,
      durationDays,
      elapsedDays,
      daysLeft: sprint.state === 'active' && sprint.endDate ? Math.round((dateOnlyToDate(sprint.endDate) - startOfDay()) / DAY_MS) : null,
      finishedLate: isCompleted && sprint.endDate ? toDateOnly(sprint.completedAt) > sprint.endDate : sprint.state === 'active' && sprint.endDate ? sprint.endDate < today : false,
      committed,
      delivered,
      committedPoints,
      deliveredPoints,
      carriedOver: isCompleted ? summary.carriedOverCount ?? 0 : work.length - done.length,
      inProgress: isCompleted ? 0 : work.filter((issue) => categoryOf(issue) === 'in_progress').length,
      completion: percent(committedPoints ? deliveredPoints : delivered, committedPoints || committed) ?? 0,
      contributors: contributorsOf(work, isDone, users),
    };
  });

  const completed = rows.filter((row) => row.state === 'completed');
  const STATE_ORDER = { planned: 0, active: 1, completed: 2 };
  const sortDate = (row) => row.completedAt ?? row.startDate ?? '';
  return {
    sprints: rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || sortDate(b).localeCompare(sortDate(a))),
    totals: {
      completed: completed.length,
      averageCompletion: completed.length ? Math.round(average(completed.map((row) => row.completion))) : null,
      averageDeliveredPoints: completed.length ? round1(average(completed.map((row) => row.deliveredPoints))) : null,
      averageDelivered: completed.length ? round1(average(completed.map((row) => row.delivered))) : null,
      totalCarriedOver: completed.reduce((total, row) => total + row.carriedOver, 0),
    },
  };
}

// --- Team performance ---------------------------------------------------------

/** Organization admins can review everyone in the organization; project admins the people in projects they administer. */
async function resolveReviewableProjects(user, requestedIds) {
  const isOrganizationAdmin = currentOrganizationRole() === 'admin';
  const scope = { organizationId: currentOrganizationId() };
  if (!isOrganizationAdmin) {
    const memberships = await ProjectMember.findAll({ where: { userId: user.id, role: 'admin' }, attributes: ['projectId'], raw: true });
    scope.id = memberships.map((membership) => membership.projectId);
  }
  if (requestedIds.length) {
    const allowed = scope.id ? requestedIds.filter((id) => scope.id.includes(id)) : requestedIds;
    const projects = allowed.length ? await Project.findAll({ where: { id: allowed, organizationId: scope.organizationId }, attributes: PROJECT_ATTRIBUTES }) : [];
    if (projects.length !== requestedIds.length) throw ApiError.forbidden('Only project admins can review team performance');
    return projects;
  }
  const projects = await Project.findAll({ where: { ...scope, archivedAt: null }, attributes: PROJECT_ATTRIBUTES, order: [['name', 'ASC']] });
  if (!projects.length && !isOrganizationAdmin) throw ApiError.forbidden('Only project admins can review team performance');
  return projects;
}

function resolvePeriod({ from, to }) {
  const end = to ?? toDateOnly(new Date());
  const start = from ?? toDateOnly(addDays(dateOnlyToDate(end), -89));
  if (start > end) throw ApiError.badRequest('The start date must be before the end date');
  return { from: start, to: end, start: dateOnlyToDate(start), end: addDays(dateOnlyToDate(end), 1) };
}

/** Weekly buckets for up to two months, calendar months beyond that. */
function buildBuckets(start, end) {
  const days = Math.round((end - start) / DAY_MS);
  const buckets = [];
  if (days <= 62) {
    for (let cursor = start; cursor < end; cursor = addDays(cursor, 7)) buckets.push({ start: cursor, end: new Date(Math.min(addDays(cursor, 7), end)), unit: 'week' });
  } else {
    let cursor = start;
    while (cursor < end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      buckets.push({ start: cursor, end: new Date(Math.min(next, end)), unit: 'month' });
      cursor = next;
    }
  }
  return buckets;
}

const SCORE_WEIGHTS = { delivery: 0.5, onTime: 0.2, quality: 0.2, collaboration: 0.1 };

async function buildPerformance(viewer, filters) {
  const projects = await resolveReviewableProjects(viewer, toList(filters.projectId));
  const projectIds = projects.map((project) => project.id);
  const period = resolvePeriod(filters);
  const { start, end } = period;
  const inPeriod = (date) => date && date >= start && date < end;

  const [statuses, issues, memberships, statusChanges] = await Promise.all([
    Status.findAll({ where: { projectId: projectIds }, attributes: ['id', 'projectId', 'name', 'category'] }),
    projectIds.length ? Issue.findAll({ where: { projectId: projectIds }, attributes: ISSUE_ATTRIBUTES }) : [],
    ProjectMember.findAll({ where: { projectId: projectIds }, attributes: ['userId', 'projectId', 'role'] }),
    projectIds.length
      ? Activity.findAll({
          where: { projectId: projectIds, action: 'updated', field: 'status', createdAt: { [Op.lt]: end } },
          attributes: ['issueId', 'projectId', 'fromValue', 'toValue', 'createdAt'],
          order: [['createdAt', 'ASC']],
        })
      : [],
  ]);
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const issueIds = new Set(issueById.keys());
  const [worklogs, comments, sprints] = await Promise.all([
    WorkLog.findAll({ where: { loggedAt: { [Op.gte]: start, [Op.lt]: end } }, attributes: ['issueId', 'userId', 'minutes'] }),
    Comment.findAll({ where: { createdAt: { [Op.gte]: start, [Op.lt]: end } }, attributes: ['issueId', 'authorId'] }),
    Sprint.findAll({ where: { projectId: projectIds }, attributes: ['id', 'name', 'state'] }),
  ]);
  const projectLogs = worklogs.filter((log) => issueIds.has(log.issueId));
  const projectComments = comments.filter((comment) => issueIds.has(comment.issueId));

  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const categoryByName = new Map(statuses.map((status) => [`${status.projectId}:${status.name}`, status.category]));
  const isDone = (issue) => statusById.get(issue.statusId)?.category === 'done';
  const today = toDateOnly(new Date());

  // When work actually began on each issue: the first move into an in-progress stage.
  const workStartedAt = new Map();
  const reopenedBy = new Map();
  for (const change of statusChanges) {
    const from = categoryByName.get(`${change.projectId}:${change.fromValue}`);
    const to = categoryByName.get(`${change.projectId}:${change.toValue}`);
    if (to === 'in_progress' && !workStartedAt.has(change.issueId)) workStartedAt.set(change.issueId, change.createdAt);
    if (from === 'done' && to !== 'done' && inPeriod(change.createdAt)) {
      const issue = issueById.get(change.issueId);
      if (issue?.assigneeId) {
        if (!reopenedBy.has(issue.assigneeId)) reopenedBy.set(issue.assigneeId, new Set());
        reopenedBy.get(issue.assigneeId).add(issue.id);
      }
    }
  }
  const cycleDaysOf = (issue) => {
    const began = workStartedAt.get(issue.id);
    const from = began && began <= issue.completedAt ? began : issue.createdAt;
    return Math.max(0, issue.completedAt - from) / DAY_MS;
  };
  const isOnTime = (issue) => (issue.dueDate ? toDateOnly(issue.completedAt) <= issue.dueDate : null);

  const completedInPeriod = issues.filter((issue) => isDone(issue) && inPeriod(issue.completedAt));
  const userIds = new Set([
    ...memberships.map((membership) => membership.userId),
    ...completedInPeriod.map((issue) => issue.assigneeId).filter(Boolean),
  ]);
  const users = await loadUsers([...userIds]);
  const buckets = buildBuckets(start, end);
  const usePoints = pointsOf(completedInPeriod) > 0;

  const rows = [...userIds]
    .filter((id) => users.has(id))
    .map((userId) => {
      const completed = completedInPeriod.filter((issue) => issue.assigneeId === userId);
      const withDue = completed.filter((issue) => issue.dueDate);
      const onTime = withDue.filter((issue) => isOnTime(issue));
      const open = issues.filter((issue) => issue.assigneeId === userId && !isDone(issue));
      const reopened = reopenedBy.get(userId)?.size ?? 0;
      const projectBreakdown = projects
        .map((project) => {
          const mine = completed.filter((issue) => issue.projectId === project.id);
          return { project: project.toJSON(), completed: mine.length, points: pointsOf(mine) };
        })
        .filter((row) => row.completed);
      return {
        user: users.get(userId),
        roles: memberships.filter((membership) => membership.userId === userId).map((membership) => membership.role),
        completed: completed.length,
        completedPoints: pointsOf(completed),
        bugsFixed: completed.filter((issue) => issue.type === 'bug').length,
        highPriorityDone: completed.filter((issue) => issue.priority === 'high' || issue.priority === 'highest').length,
        withDueDate: withDue.length,
        onTime: onTime.length,
        onTimeRate: percent(onTime.length, withDue.length),
        averageCycleDays: round1(average(completed.map(cycleDaysOf))),
        reopened,
        loggedMinutes: projectLogs.filter((log) => log.userId === userId).reduce((total, log) => total + log.minutes, 0),
        comments: projectComments.filter((comment) => comment.authorId === userId).length,
        created: issues.filter((issue) => issue.reporterId === userId && inPeriod(issue.createdAt)).length,
        open: open.length,
        openPoints: pointsOf(open),
        overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
        trend: buckets.map((bucket) => completed.filter((issue) => issue.completedAt >= bucket.start && issue.completedAt < bucket.end).length),
        projects: projectBreakdown,
        completedIssues: completed,
      };
    });

  // Contribution score: delivery relative to the top performer, weighted with reliability, quality and collaboration.
  const deliveryOf = (row) => (usePoints ? row.completedPoints : row.completed);
  const maxDelivery = Math.max(0, ...rows.map(deliveryOf));
  const maxCollaboration = Math.max(0, ...rows.map((row) => row.comments + row.created));
  const teamWithDue = rows.reduce((total, row) => total + row.withDueDate, 0);
  const teamOnTime = rows.reduce((total, row) => total + row.onTime, 0);
  const teamOnTimeRate = teamWithDue ? teamOnTime / teamWithDue : 1;
  for (const row of rows) {
    if (!row.completed) {
      row.score = null;
      continue;
    }
    const factors = [
      [SCORE_WEIGHTS.delivery, maxDelivery ? deliveryOf(row) / maxDelivery : 0],
      [SCORE_WEIGHTS.onTime, row.onTimeRate === null ? teamOnTimeRate : row.onTimeRate / 100],
      [SCORE_WEIGHTS.quality, Math.max(0, 1 - row.reopened / row.completed)],
      ...(maxCollaboration ? [[SCORE_WEIGHTS.collaboration, (row.comments + row.created) / maxCollaboration]] : []),
    ];
    const weight = factors.reduce((total, [factorWeight]) => total + factorWeight, 0);
    row.score = Math.round((factors.reduce((total, [factorWeight, value]) => total + factorWeight * value, 0) / weight) * 100);
  }
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.completed - a.completed || a.user.name.localeCompare(b.user.name));
  let rank = 0;
  for (const row of rows) row.rank = row.score === null ? null : ++rank;

  const best = (list, pick, compare = (a, b) => b - a) => [...list].sort((a, b) => compare(pick(a), pick(b)))[0];
  const highlights = [];
  const deliverers = rows.filter((row) => row.completed);
  const top = best(deliverers, deliveryOf);
  if (top) highlights.push({ kind: 'top_delivery', userId: top.user.id, title: 'Top delivery', detail: usePoints ? `${top.completedPoints} points delivered` : `${top.completed} tasks completed` });
  const reliable = best(rows.filter((row) => row.withDueDate >= 3), (row) => row.onTimeRate);
  if (reliable) highlights.push({ kind: 'most_reliable', userId: reliable.user.id, title: 'Most reliable', detail: `${reliable.onTimeRate}% delivered on time` });
  const fastest = best(rows.filter((row) => row.completed >= 3 && row.averageCycleDays !== null), (row) => row.averageCycleDays, (a, b) => a - b);
  if (fastest) highlights.push({ kind: 'fastest', userId: fastest.user.id, title: 'Fastest finisher', detail: `${fastest.averageCycleDays} days per task on average` });
  const bugHunter = best(rows.filter((row) => row.bugsFixed >= 2), (row) => row.bugsFixed);
  if (bugHunter) highlights.push({ kind: 'bug_hunter', userId: bugHunter.user.id, title: 'Bug hunter', detail: `${bugHunter.bugsFixed} bugs fixed` });
  const collaborator = best(rows.filter((row) => row.comments >= 3), (row) => row.comments);
  if (collaborator) highlights.push({ kind: 'collaborator', userId: collaborator.user.id, title: 'Team player', detail: `${collaborator.comments} comments` });
  const hours = best(rows.filter((row) => row.loggedMinutes >= 60), (row) => row.loggedMinutes);
  if (hours) highlights.push({ kind: 'most_hours', userId: hours.user.id, title: 'Most time logged', detail: `${round1(hours.loggedMinutes / 60)} hours` });

  return {
    period: { from: period.from, to: period.to },
    projects: projects.map((project) => project.toJSON()),
    unit: usePoints ? 'points' : 'issues',
    buckets: buckets.map((bucket) => ({ start: toDateOnly(bucket.start), unit: bucket.unit })),
    totals: {
      people: rows.filter((row) => row.completed).length,
      completed: completedInPeriod.length,
      completedPoints: pointsOf(completedInPeriod),
      onTimeRate: percent(teamOnTime, teamWithDue),
      averageCycleDays: round1(average(completedInPeriod.map(cycleDaysOf))),
      loggedMinutes: projectLogs.reduce((total, log) => total + log.minutes, 0),
      reopened: [...reopenedBy.values()].reduce((total, set) => total + set.size, 0),
    },
    highlights,
    rows,
    context: { issueById, sprints, projects, isOnTime, cycleDaysOf, isDone, statusById, today, reopenedBy },
  };
}

export async function getTeamPerformance(viewer, filters) {
  const { rows, context: _context, ...report } = await buildPerformance(viewer, filters);
  return { ...report, members: rows.map(({ completedIssues: _issues, ...row }) => row) };
}

/** One person's review for the period: every completed issue, plus where (module, sprint) the work went. */
export async function getMemberReview(viewer, userId, filters) {
  if (!UUID_PATTERN.test(userId)) throw ApiError.notFound('Member not found');
  const { rows, context, period, unit, buckets, totals } = await buildPerformance(viewer, filters);
  const row = rows.find((candidate) => candidate.user.id === userId);
  if (!row) throw ApiError.notFound('Member not found');
  const { issueById, sprints, projects, isOnTime, cycleDaysOf, isDone, statusById, today, reopenedBy } = context;
  const projectById = new Map(projects.map((project) => [project.id, project.toJSON()]));
  const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]));

  const moduleOf = (issue) => {
    let cursor = issue.parentId ? issueById.get(issue.parentId) : null;
    for (let depth = 0; cursor && depth < 10; depth += 1) {
      if (cursor.type === 'epic') return cursor;
      cursor = cursor.parentId ? issueById.get(cursor.parentId) : null;
    }
    return null;
  };
  const describe = (issue) => {
    const module = moduleOf(issue);
    const sprint = issue.sprintId ? sprintById.get(issue.sprintId) : null;
    const status = statusById.get(issue.statusId);
    return {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      storyPoints: issue.storyPoints,
      dueDate: issue.dueDate,
      status: status ? { name: status.name, category: status.category } : null,
      project: projectById.get(issue.projectId) ?? null,
      module: module ? { id: module.id, key: module.key, title: module.title } : null,
      sprint: sprint ? { id: sprint.id, name: sprint.name, state: sprint.state } : null,
    };
  };
  const group = (list, keyOf, labelOf) => {
    const groups = new Map();
    for (const issue of list) {
      const key = keyOf(issue) ?? 'none';
      const entry = groups.get(key) ?? { ...labelOf(issue), completed: 0, points: 0 };
      entry.completed += 1;
      entry.points += issue.storyPoints ?? 0;
      groups.set(key, entry);
    }
    return [...groups.values()].sort((a, b) => b.completed - a.completed);
  };

  const completed = [...row.completedIssues].sort((a, b) => b.completedAt - a.completedAt);
  const open = [...issueById.values()].filter((issue) => issue.assigneeId === userId && !isDone(issue));
  const { completedIssues: _issues, ...summary } = row;

  return {
    period,
    unit,
    buckets,
    team: { people: rows.filter((candidate) => candidate.completed).length, averageCompleted: round1(average(rows.filter((candidate) => candidate.completed).map((candidate) => candidate.completed))), totals },
    member: summary,
    completed: completed.map((issue) => ({
      ...describe(issue),
      completedAt: issue.completedAt.toISOString(),
      onTime: isOnTime(issue),
      cycleDays: round1(cycleDaysOf(issue)),
    })),
    open: open
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .map((issue) => ({ ...describe(issue), overdue: Boolean(issue.dueDate && issue.dueDate < today) })),
    reopened: [...(reopenedBy.get(userId) ?? [])].map((id) => issueById.get(id)).filter(Boolean).map(describe),
    byModule: group(
      completed,
      (issue) => moduleOf(issue)?.id,
      (issue) => {
        const module = moduleOf(issue);
        return { module: module ? { id: module.id, key: module.key, title: module.title } : null };
      },
    ),
    bySprint: group(
      completed,
      (issue) => issue.sprintId,
      (issue) => {
        const sprint = issue.sprintId ? sprintById.get(issue.sprintId) : null;
        return { sprint: sprint ? { id: sprint.id, name: sprint.name, state: sprint.state } : null };
      },
    ),
  };
}
