import { Op } from 'sequelize';
import { Issue, Project, ProjectMember, User, WorkLog } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId, currentOrganizationRole } from '../../shared/context/request-context.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyToDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function resolvePeriod({ from, to }) {
  const end = to ?? toDateOnly(new Date());
  const start = from ?? toDateOnly(addDays(dateOnlyToDate(end), -29));
  if (start > end) throw ApiError.badRequest('The start date must be before the end date');
  return { from: start, to: end, start: dateOnlyToDate(start), end: addDays(dateOnlyToDate(end), 1) };
}

async function resolveProjects(user, projectId) {
  const organizationId = currentOrganizationId();
  const isOrgAdmin = currentOrganizationRole() === 'admin';
  let where = { organizationId, archivedAt: null };
  if (projectId) {
    where.id = projectId;
  } else if (!isOrgAdmin) {
    const memberships = await ProjectMember.findAll({
      where: { userId: user.id },
      attributes: ['projectId'],
      raw: true,
    });
    where.id = memberships.map((row) => row.projectId);
    if (!where.id.length) return [];
  }
  return Project.findAll({
    where,
    attributes: ['id', 'key', 'name', 'color'],
    order: [['name', 'ASC']],
  });
}

/** Worklog rollups for accessible projects: by day, user, project, and issue. */
export async function getTimeReport(user, filters = {}) {
  const period = resolvePeriod(filters);
  const projects = await resolveProjects(user, filters.projectId || null);
  if (!projects.length) {
    return {
      period: { from: period.from, to: period.to },
      totals: { minutes: 0, entries: 0 },
      byDay: [],
      byUser: [],
      byProject: [],
      byIssue: [],
    };
  }

  const projectIds = projects.map((project) => project.id);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const issues = await Issue.findAll({
    where: { projectId: projectIds },
    attributes: ['id', 'key', 'title', 'projectId'],
  });
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const issueIds = issues.map((issue) => issue.id);
  if (!issueIds.length) {
    return {
      period: { from: period.from, to: period.to },
      totals: { minutes: 0, entries: 0 },
      byDay: [],
      byUser: [],
      byProject: [],
      byIssue: [],
    };
  }

  const where = {
    issueId: issueIds,
    loggedAt: { [Op.gte]: period.start, [Op.lt]: period.end },
  };
  if (filters.userId) where.userId = filters.userId;

  const logs = await WorkLog.findAll({
    where,
    attributes: ['id', 'issueId', 'userId', 'minutes', 'loggedAt'],
    include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
  });

  const byDayMap = new Map();
  const byUserMap = new Map();
  const byProjectMap = new Map();
  const byIssueMap = new Map();
  let totalMinutes = 0;

  for (const log of logs) {
    const minutes = Number(log.minutes) || 0;
    totalMinutes += minutes;
    const day = toDateOnly(log.loggedAt);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + minutes);

    const userKey = log.userId ?? 'unknown';
    const userEntry = byUserMap.get(userKey) ?? { user: log.user ?? null, minutes: 0 };
    userEntry.minutes += minutes;
    byUserMap.set(userKey, userEntry);

    const issue = issueById.get(log.issueId);
    if (!issue) continue;
    const project = projectById.get(issue.projectId);
    if (project) {
      const projectEntry = byProjectMap.get(project.id) ?? {
        project: { id: project.id, key: project.key, name: project.name, color: project.color },
        minutes: 0,
      };
      projectEntry.minutes += minutes;
      byProjectMap.set(project.id, projectEntry);
    }

    const issueEntry = byIssueMap.get(issue.id) ?? {
      issue: { id: issue.id, key: issue.key, title: issue.title, projectId: issue.projectId },
      minutes: 0,
      entries: 0,
    };
    issueEntry.minutes += minutes;
    issueEntry.entries += 1;
    byIssueMap.set(issue.id, issueEntry);
  }

  const byDay = [];
  for (let cursor = period.start; cursor < period.end; cursor = addDays(cursor, 1)) {
    const date = toDateOnly(cursor);
    byDay.push({ date, minutes: byDayMap.get(date) ?? 0 });
  }

  return {
    period: { from: period.from, to: period.to },
    totals: { minutes: totalMinutes, entries: logs.length },
    byDay,
    byUser: [...byUserMap.values()].sort((a, b) => b.minutes - a.minutes),
    byProject: [...byProjectMap.values()].sort((a, b) => b.minutes - a.minutes),
    byIssue: [...byIssueMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 100),
  };
}
