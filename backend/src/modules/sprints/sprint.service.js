import { Issue, Project, Sprint, Status } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { addDays, toDateOnly } from '../../shared/utils/query.js';
import { logActivity } from '../activity/activity.service.js';

const STATE_ORDER = { active: 0, planned: 1, completed: 2 };

async function loadSprint(projectId, sprintId) {
  const sprint = await Sprint.findOne({ where: { id: sprintId, projectId } });
  if (!sprint) throw ApiError.notFound('Sprint not found');
  return sprint;
}

async function sprintIssuesWithCategory(sprintIds) {
  return Issue.findAll({
    where: { sprintId: sprintIds },
    attributes: ['id', 'sprintId', 'storyPoints', 'parentId'],
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });
}

function computeStats(issues) {
  return issues.reduce(
    (stats, issue) => {
      const points = issue.storyPoints ?? 0;
      stats.issueCount += 1;
      stats.totalPoints += points;
      if (issue.status.category === 'done') {
        stats.doneCount += 1;
        stats.donePoints += points;
      }
      return stats;
    },
    { issueCount: 0, doneCount: 0, totalPoints: 0, donePoints: 0 },
  );
}

export async function listSprints(projectId) {
  const sprints = await Sprint.findAll({ where: { projectId }, order: [['createdAt', 'ASC']] });
  const issues = await sprintIssuesWithCategory(sprints.map((sprint) => sprint.id));
  return sprints
    .map((sprint) => ({
      ...sprint.toJSON(),
      stats: computeStats(issues.filter((issue) => issue.sprintId === sprint.id)),
    }))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

async function nextSprintName(projectId) {
  const project = await Project.findByPk(projectId, { attributes: ['key'] });
  const count = await Sprint.count({ where: { projectId } });
  return `${project.key} Sprint ${count + 1}`;
}

export async function createSprint(projectId, input) {
  return Sprint.create({ ...input, projectId, name: input.name ?? (await nextSprintName(projectId)) });
}

export async function updateSprint(projectId, sprintId, changes) {
  const sprint = await loadSprint(projectId, sprintId);
  if (sprint.state === 'completed') throw ApiError.badRequest('Completed sprints cannot be edited');
  return sprint.update(changes);
}

export async function startSprint(projectId, sprintId, input, actor) {
  const sprint = await loadSprint(projectId, sprintId);
  if (sprint.state !== 'planned') throw ApiError.badRequest('Only planned sprints can be started');
  const active = await Sprint.count({ where: { projectId, state: 'active' } });
  if (active) throw ApiError.badRequest('Complete the active sprint before starting another one');

  const project = await Project.findByPk(projectId, { attributes: ['settings'] });
  const startDate = input.startDate ?? sprint.startDate ?? toDateOnly(new Date());
  const lengthDays = project.settings?.sprintLengthDays ?? 14;
  const endDate = input.endDate ?? sprint.endDate ?? toDateOnly(addDays(new Date(startDate), lengthDays));
  if (endDate < startDate) throw ApiError.badRequest('The end date must be after the start date');

  await sprint.update({ state: 'active', startDate, endDate, goal: input.goal ?? sprint.goal });
  await logActivity({ projectId, actorId: actor.id, action: 'sprint_started', toValue: sprint.name });
  eventBus.publish(DomainEvents.SPRINT_STARTED, { sprint: sprint.toJSON(), actorId: actor.id });
  return sprint;
}

async function resolveCarryOverTarget(projectId, sprint, moveIncompleteTo) {
  if (moveIncompleteTo === 'backlog') return null;
  if (moveIncompleteTo === 'new_sprint') return (await createSprint(projectId, {})).id;
  if (moveIncompleteTo && moveIncompleteTo !== 'next_sprint') {
    const target = await loadSprint(projectId, moveIncompleteTo);
    if (target.state !== 'planned') throw ApiError.badRequest('Move unfinished work to a planned sprint');
    return target.id;
  }
  const next = await Sprint.findOne({ where: { projectId, state: 'planned' }, order: [['createdAt', 'ASC']] });
  return next ? next.id : (await createSprint(projectId, {})).id;
}

export async function completeSprint(projectId, sprintId, { moveIncompleteTo }, actor) {
  const sprint = await loadSprint(projectId, sprintId);
  if (sprint.state !== 'active') throw ApiError.badRequest('Only the active sprint can be completed');

  const project = await Project.findByPk(projectId, { attributes: ['settings'] });
  const destination = moveIncompleteTo ?? (project.settings?.carryOverIncomplete === false ? 'backlog' : 'next_sprint');

  const issues = await sprintIssuesWithCategory([sprint.id]);
  const stats = computeStats(issues);
  const incompleteIds = issues.filter((issue) => issue.status.category !== 'done').map((issue) => issue.id);

  const targetSprintId = incompleteIds.length ? await resolveCarryOverTarget(projectId, sprint, destination) : null;
  if (incompleteIds.length) await Issue.update({ sprintId: targetSprintId }, { where: { id: incompleteIds } });

  const summary = { ...stats, carriedOverCount: incompleteIds.length, carriedOverTo: targetSprintId };
  await sprint.update({ state: 'completed', completedAt: new Date(), summary });
  await logActivity({ projectId, actorId: actor.id, action: 'sprint_completed', toValue: sprint.name, meta: summary });
  eventBus.publish(DomainEvents.SPRINT_COMPLETED, { sprint: sprint.toJSON(), actorId: actor.id });
  return sprint;
}

export async function deleteSprint(projectId, sprintId) {
  const sprint = await loadSprint(projectId, sprintId);
  if (sprint.state === 'active') throw ApiError.badRequest('Complete the sprint before deleting it');
  await Issue.update({ sprintId: null }, { where: { sprintId } });
  await sprint.destroy();
}
