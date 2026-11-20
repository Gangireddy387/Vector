import { Op, col, fn } from 'sequelize';
import { Issue, ProjectMember, Sprint, Status, User } from '../../database/models.js';
import { listProjects } from '../projects/project.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const PREVIEW_LIMIT = 4;

function completionPercent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

/** Same health rules as the frontend portfolio grid. */
export function healthOf({ issues, activeSprint }) {
  if (!issues?.total) return 'empty';
  if (issues.open === 0) return 'done';
  if ((issues.overdue ?? 0) > 0) return 'overdue';
  const completion = completionPercent(issues.done, issues.total);
  if (activeSprint?.endDate) {
    const days = Math.ceil((new Date(`${activeSprint.endDate}T00:00:00`).getTime() - Date.now()) / 86_400_000);
    if (days <= 3 && completion < 70) return 'at_risk';
  }
  if (completion < 25 && issues.open >= 8) return 'at_risk';
  return 'on_track';
}

async function categoryBreakdown(projectIds) {
  const summary = new Map(
    projectIds.map((id) => [id, { total: 0, open: 0, done: 0, overdue: 0, todo: 0, inProgress: 0 }]),
  );
  if (!projectIds.length) return summary;

  const [counts, statuses] = await Promise.all([
    Issue.findAll({
      where: { projectId: projectIds },
      attributes: ['projectId', 'statusId', [fn('COUNT', col('id')), 'count']],
      group: ['projectId', 'statusId'],
      raw: true,
    }),
    Status.findAll({ where: { projectId: projectIds }, attributes: ['id', 'category'], raw: true }),
  ]);

  const categoryById = new Map(statuses.map((status) => [status.id, status.category]));
  const doneStatusIds = statuses.filter((status) => status.category === 'done').map((status) => status.id);

  for (const row of counts) {
    const entry = summary.get(row.projectId);
    const count = Number(row.count);
    const category = categoryById.get(row.statusId);
    entry.total += count;
    if (category === 'done') entry.done += count;
    else entry.open += count;
    if (category === 'todo') entry.todo += count;
    else if (category === 'in_progress') entry.inProgress += count;
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdueWhere = { projectId: projectIds, dueDate: { [Op.lt]: today } };
  if (doneStatusIds.length) overdueWhere.statusId = { [Op.notIn]: doneStatusIds };

  const overdueRows = await Issue.findAll({
    where: overdueWhere,
    attributes: ['projectId', [fn('COUNT', col('id')), 'count']],
    group: ['projectId'],
    raw: true,
  });
  for (const row of overdueRows) {
    const entry = summary.get(row.projectId);
    if (entry) entry.overdue = Number(row.count);
  }

  return summary;
}

async function activeSprintStats(projectIds) {
  const sprints = await Sprint.findAll({
    where: { projectId: projectIds, state: 'active' },
    attributes: ['id', 'projectId', 'name', 'state', 'startDate', 'endDate'],
    raw: true,
  });
  if (!sprints.length) return new Map();

  const issues = await Issue.findAll({
    where: { sprintId: sprints.map((sprint) => sprint.id) },
    attributes: ['sprintId'],
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });

  const bySprint = new Map();
  for (const sprint of sprints) {
    const sprintIssues = issues.filter((issue) => issue.sprintId === sprint.id);
    const doneCount = sprintIssues.filter((issue) => issue.status?.category === 'done').length;
    bySprint.set(sprint.projectId, {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      issueCount: sprintIssues.length,
      doneCount,
      progressPercent: completionPercent(doneCount, sprintIssues.length),
    });
  }
  return bySprint;
}

async function memberPreviews(projectIds) {
  const rows = await ProjectMember.findAll({
    where: { projectId: projectIds },
    attributes: ['projectId', 'userId'],
    include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'ASC']],
  });

  const byProject = new Map(projectIds.map((id) => [id, { count: 0, preview: [] }]));
  for (const row of rows) {
    const entry = byProject.get(row.projectId);
    if (!entry) continue;
    entry.count += 1;
    if (entry.preview.length < PREVIEW_LIMIT && row.user) {
      entry.preview.push(row.user.toJSON ? row.user.toJSON() : row.user);
    }
  }
  return byProject;
}

/** Org-wide portfolio rollup for every project the caller can access. */
export async function getPortfolioRollup(userId, { includeArchived = false } = {}) {
  const projects = await listProjects(userId, { includeArchived });
  const ids = projects.map((project) => project.id);

  const [issuesByProject, sprintByProject, membersByProject] = await Promise.all([
    categoryBreakdown(ids),
    activeSprintStats(ids),
    memberPreviews(ids),
  ]);

  const rows = projects.map((project) => {
    const issues = issuesByProject.get(project.id) ?? {
      total: 0,
      open: 0,
      done: 0,
      overdue: 0,
      todo: 0,
      inProgress: 0,
    };
    const activeSprint = sprintByProject.get(project.id) ?? null;
    const members = membersByProject.get(project.id) ?? { count: project.memberCount ?? 0, preview: [] };

    // Prefer lead in the avatar stack when they are not already included.
    if (project.lead && !members.preview.some((user) => user.id === project.lead.id)) {
      members.preview = [project.lead, ...members.preview].slice(0, PREVIEW_LIMIT);
    }

    const health = healthOf({ issues, activeSprint });
    return {
      id: project.id,
      name: project.name,
      key: project.key,
      color: project.color,
      type: project.type,
      lead: project.lead ?? null,
      myRole: project.myRole,
      isMember: project.isMember,
      archivedAt: project.archivedAt ?? null,
      issues,
      progressPercent: completionPercent(issues.done, issues.total),
      health,
      activeSprint,
      members: { count: members.count || project.memberCount || 0, preview: members.preview },
    };
  });

  const totals = {
    projects: rows.length,
    open: 0,
    done: 0,
    overdue: 0,
    todo: 0,
    inProgress: 0,
    atRisk: 0,
    onTrack: 0,
    complete: 0,
    empty: 0,
  };

  for (const row of rows) {
    totals.open += row.issues.open;
    totals.done += row.issues.done;
    totals.overdue += row.issues.overdue;
    totals.todo += row.issues.todo;
    totals.inProgress += row.issues.inProgress;
    if (row.health === 'overdue' || row.health === 'at_risk') totals.atRisk += 1;
    if (row.health === 'on_track') totals.onTrack += 1;
    if (row.health === 'done') totals.complete += 1;
    if (row.health === 'empty') totals.empty += 1;
  }

  return { totals, projects: rows };
}
