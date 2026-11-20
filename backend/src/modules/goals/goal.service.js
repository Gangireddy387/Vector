import { Op } from 'sequelize';
import {
  Goal,
  Issue,
  KeyResult,
  KeyResultCheckIn,
  KeyResultLink,
  Project,
  Status,
  User,
} from '../../database/models.js';
import { likeOperator } from '../../database/connection.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { assertProjectRole } from '../projects/project-access.js';
import { GOAL_STATUSES, KEY_RESULT_METRIC_TYPES } from './goal.model.js';

function orgId() {
  const id = currentOrganizationId();
  if (!id) throw ApiError.badRequest('Choose an organization first');
  return id;
}

const keyResultInclude = [
  { model: User, as: 'owner', attributes: USER_SUMMARY_ATTRIBUTES },
  {
    model: KeyResultLink,
    as: 'links',
    include: [
      {
        model: Issue,
        as: 'issue',
        attributes: ['id', 'key', 'title', 'type', 'statusId', 'projectId'],
        include: [{ model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] }],
      },
    ],
  },
];

async function loadGoal(goalId, { forUpdate = false } = {}) {
  const goal = await Goal.findOne({
    where: { id: goalId, organizationId: orgId() },
    include: forUpdate
      ? []
      : [
          { model: User, as: 'owner', attributes: USER_SUMMARY_ATTRIBUTES },
          { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
          { model: Goal, as: 'parent', attributes: ['id', 'title', 'status'] },
          {
            model: KeyResult,
            as: 'keyResults',
            include: keyResultInclude,
            order: [['position', 'ASC']],
          },
        ],
    order: forUpdate ? undefined : [[{ model: KeyResult, as: 'keyResults' }, 'position', 'ASC']],
  });
  if (!goal) throw ApiError.notFound('Goal not found');
  return goal;
}

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function manualProgress(kr) {
  const start = Number(kr.startValue) || 0;
  const target = Number(kr.targetValue);
  const current = Number(kr.currentValue) || 0;
  if (kr.metricType === 'binary') return current >= target ? 100 : 0;
  if (!Number.isFinite(target) || target === start) return current >= target ? 100 : 0;
  return clampProgress(((current - start) / (target - start)) * 100);
}

async function linkedProgress(kr) {
  const links = kr.links ?? [];
  if (!links.length) return { progress: 0, done: 0, total: 0 };
  let done = 0;
  for (const link of links) {
    if (link.issue?.status?.category === 'done') done += 1;
  }
  const total = links.length;
  return { progress: clampProgress((done / total) * 100), done, total };
}

async function enrichKeyResult(kr) {
  const json = typeof kr.toJSON === 'function' ? kr.toJSON() : { ...kr };
  if (json.metricType === 'linked_progress') {
    const linked = await linkedProgress(json);
    return {
      ...json,
      progress: linked.progress,
      linkedDone: linked.done,
      linkedTotal: linked.total,
      currentValue: linked.progress,
    };
  }
  return { ...json, progress: manualProgress(json), linkedDone: null, linkedTotal: null };
}

async function krProgressOnly(goalId) {
  const keyResults = await KeyResult.findAll({
    where: { goalId },
    include: keyResultInclude,
  });
  const enriched = await Promise.all(keyResults.map((kr) => enrichKeyResult(kr)));
  if (!enriched.length) return 0;
  return clampProgress(enriched.reduce((sum, kr) => sum + (kr.progress ?? 0), 0) / enriched.length);
}

/** Child goals' average progress, or KR average when there are no children. */
async function cascadeProgress(goalId, seen = new Set()) {
  if (seen.has(goalId)) return 0;
  seen.add(goalId);
  const children = await Goal.findAll({
    where: { parentGoalId: goalId, organizationId: orgId() },
    attributes: ['id'],
    raw: true,
  });
  if (children.length) {
    const scores = await Promise.all(children.map((child) => cascadeProgress(child.id, seen)));
    return clampProgress(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  }
  return krProgressOnly(goalId);
}

async function presentGoal(goal) {
  const json = goal.toJSON();
  const keyResults = await Promise.all((json.keyResults ?? []).map((kr) => enrichKeyResult(kr)));

  const children = await Goal.findAll({
    where: { parentGoalId: json.id, organizationId: orgId() },
    attributes: ['id', 'title', 'status', 'periodStart', 'periodEnd'],
    include: [{ model: User, as: 'owner', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [
      ['position', 'ASC'],
      ['createdAt', 'DESC'],
    ],
  });

  const childSummaries = await Promise.all(
    children.map(async (child) => ({
      id: child.id,
      title: child.title,
      status: child.status,
      periodStart: child.periodStart,
      periodEnd: child.periodEnd,
      owner: child.owner ?? null,
      progress: await cascadeProgress(child.id),
    })),
  );

  const progress = childSummaries.length
    ? clampProgress(childSummaries.reduce((sum, child) => sum + child.progress, 0) / childSummaries.length)
    : keyResults.length
      ? clampProgress(keyResults.reduce((sum, kr) => sum + (kr.progress ?? 0), 0) / keyResults.length)
      : 0;

  const lastByKr = new Map();
  const krIds = keyResults.map((kr) => kr.id);
  if (krIds.length) {
    const lastCheckIns = await KeyResultCheckIn.findAll({
      where: { keyResultId: krIds },
      attributes: ['keyResultId', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    for (const row of lastCheckIns) {
      if (!lastByKr.has(row.keyResultId)) lastByKr.set(row.keyResultId, row.createdAt);
    }
  }

  return {
    ...json,
    keyResults: keyResults.map((kr) => ({
      ...kr,
      lastCheckInAt: lastByKr.get(kr.id) ?? null,
    })),
    progress,
    children: childSummaries,
    parent: json.parent
      ? { id: json.parent.id, title: json.parent.title, status: json.parent.status }
      : null,
  };
}

export async function listGoals(filters = {}) {
  const where = { organizationId: orgId() };
  if (filters.status) where.status = filters.status;
  if (filters.projectId) where.projectId = filters.projectId;

  const goals = await Goal.findAll({
    where,
    include: [
      { model: User, as: 'owner', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
      { model: Goal, as: 'parent', attributes: ['id', 'title', 'status'] },
      {
        model: KeyResult,
        as: 'keyResults',
        include: keyResultInclude,
      },
    ],
    order: [
      ['periodStart', 'DESC'],
      ['position', 'ASC'],
      ['createdAt', 'DESC'],
      [{ model: KeyResult, as: 'keyResults' }, 'position', 'ASC'],
    ],
  });
  return Promise.all(goals.map((goal) => presentGoal(goal)));
}

export async function getGoal(goalId) {
  return presentGoal(await loadGoal(goalId));
}

async function assertOptionalProject(projectId, userId) {
  if (!projectId) return null;
  const project = await Project.findOne({ where: { id: projectId, organizationId: orgId() } });
  if (!project) throw ApiError.badRequest('Unknown project');
  await assertProjectRole(projectId, userId, 'viewer');
  return project;
}

async function assertParentGoal(parentGoalId, selfId = null) {
  if (!parentGoalId) return null;
  if (selfId && parentGoalId === selfId) throw ApiError.badRequest('A goal cannot be its own parent');
  const parent = await Goal.findOne({ where: { id: parentGoalId, organizationId: orgId() }, attributes: ['id', 'parentGoalId'] });
  if (!parent) throw ApiError.badRequest('Parent goal not found');
  let cursor = parent.parentGoalId;
  const seen = new Set([parent.id]);
  while (cursor) {
    if (selfId && cursor === selfId) throw ApiError.badRequest('That parent would create a cycle');
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const next = await Goal.findOne({ where: { id: cursor, organizationId: orgId() }, attributes: ['parentGoalId'], raw: true });
    cursor = next?.parentGoalId ?? null;
  }
  return parent;
}

export async function createGoal(input, actor) {
  await assertOptionalProject(input.projectId, actor.id);
  if (input.status && !GOAL_STATUSES.includes(input.status)) throw ApiError.badRequest('Invalid status');
  await assertParentGoal(input.parentGoalId ?? null);
  const max = (await Goal.max('position', { where: { organizationId: orgId() } })) ?? 0;
  const goal = await Goal.create({
    organizationId: orgId(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    projectId: input.projectId ?? null,
    parentGoalId: input.parentGoalId ?? null,
    ownerId: input.ownerId ?? actor.id,
    createdById: actor.id,
    status: input.status ?? 'active',
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    position: max + 1,
  });
  return getGoal(goal.id);
}

export async function updateGoal(goalId, changes, actor) {
  const goal = await loadGoal(goalId, { forUpdate: true });
  if ('projectId' in changes) await assertOptionalProject(changes.projectId, actor.id);
  if ('parentGoalId' in changes) await assertParentGoal(changes.parentGoalId, goal.id);
  const updates = {};
  for (const key of ['title', 'description', 'projectId', 'ownerId', 'status', 'periodStart', 'periodEnd', 'parentGoalId']) {
    if (key in changes) {
      if (key === 'title') updates.title = String(changes.title).trim();
      else if (key === 'description') updates.description = changes.description?.trim() || null;
      else if (key === 'status') {
        if (!GOAL_STATUSES.includes(changes.status)) throw ApiError.badRequest('Invalid status');
        updates.status = changes.status;
      } else updates[key] = changes[key] ?? null;
    }
  }
  await goal.update(updates);
  return getGoal(goal.id);
}

export async function removeGoal(goalId) {
  const goal = await loadGoal(goalId, { forUpdate: true });
  await goal.destroy();
}

export async function createKeyResult(goalId, input) {
  const goal = await loadGoal(goalId, { forUpdate: true });
  const metricType = input.metricType ?? 'percent';
  if (!KEY_RESULT_METRIC_TYPES.includes(metricType)) throw ApiError.badRequest('Invalid metric type');
  const max = (await KeyResult.max('position', { where: { goalId: goal.id } })) ?? 0;
  const defaults =
    metricType === 'percent'
      ? { startValue: 0, targetValue: 100, currentValue: 0 }
      : metricType === 'binary'
        ? { startValue: 0, targetValue: 1, currentValue: 0 }
        : { startValue: input.startValue ?? 0, targetValue: input.targetValue ?? 100, currentValue: input.currentValue ?? 0 };

  await KeyResult.create({
    goalId: goal.id,
    title: input.title.trim(),
    metricType,
    startValue: input.startValue ?? defaults.startValue,
    targetValue: input.targetValue ?? defaults.targetValue,
    currentValue: input.currentValue ?? defaults.currentValue,
    unit: input.unit?.trim() || null,
    ownerId: input.ownerId ?? null,
    position: max + 1,
  });
  return getGoal(goal.id);
}

export async function updateKeyResult(goalId, keyResultId, changes, actor = null) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId } });
  if (!kr) throw ApiError.notFound('Key result not found');
  const updates = {};
  if ('title' in changes) updates.title = String(changes.title).trim();
  if ('metricType' in changes) {
    if (!KEY_RESULT_METRIC_TYPES.includes(changes.metricType)) throw ApiError.badRequest('Invalid metric type');
    updates.metricType = changes.metricType;
  }
  for (const key of ['startValue', 'targetValue', 'currentValue', 'unit', 'ownerId']) {
    if (key in changes) updates[key] = key === 'unit' ? changes.unit?.trim() || null : changes[key];
  }
  const previousValue = Number(kr.currentValue);
  await kr.update(updates);
  if ('currentValue' in updates && Number(updates.currentValue) !== previousValue && kr.metricType !== 'linked_progress') {
    const next = { ...kr.toJSON(), ...updates };
    await KeyResultCheckIn.create({
      keyResultId: kr.id,
      value: Number(updates.currentValue),
      progress: manualProgress(next),
      note: null,
      createdById: actor?.id ?? null,
    });
  }
  return getGoal(goalId);
}

export async function createKeyResultCheckIn(goalId, keyResultId, { value, note }, actor) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId } });
  if (!kr) throw ApiError.notFound('Key result not found');
  if (kr.metricType === 'linked_progress') {
    throw ApiError.badRequest('Linked-task key results update from task status — use a note-only comment on the goal if needed');
  }
  if (!Number.isFinite(Number(value))) throw ApiError.badRequest('Enter a numeric value');

  await kr.update({ currentValue: Number(value) });
  const progress = manualProgress({ ...kr.toJSON(), currentValue: Number(value) });
  const checkIn = await KeyResultCheckIn.create({
    keyResultId: kr.id,
    value: Number(value),
    progress,
    note: note?.trim() || null,
    createdById: actor?.id ?? null,
  });
  const withAuthor = await KeyResultCheckIn.findByPk(checkIn.id, {
    include: [{ model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES }],
  });
  return { goal: await getGoal(goalId), checkIn: withAuthor.toJSON() };
}

export async function listKeyResultCheckIns(goalId, keyResultId, { limit = 30 } = {}) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId }, attributes: ['id'] });
  if (!kr) throw ApiError.notFound('Key result not found');
  const checkIns = await KeyResultCheckIn.findAll({
    where: { keyResultId: kr.id },
    include: [{ model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(limit) || 30, 100),
  });
  return checkIns.map((row) => row.toJSON());
}

export async function removeKeyResult(goalId, keyResultId) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId } });
  if (!kr) throw ApiError.notFound('Key result not found');
  await kr.destroy();
  return getGoal(goalId);
}

export async function addKeyResultLink(goalId, keyResultId, issueId, actor) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId } });
  if (!kr) throw ApiError.notFound('Key result not found');

  const issue = await Issue.findByPk(issueId, { attributes: ['id', 'projectId'] });
  if (!issue) throw ApiError.notFound('Task not found');
  await assertProjectRole(issue.projectId, actor.id, 'viewer');

  const project = await Project.findByPk(issue.projectId, { attributes: ['organizationId'] });
  if (project?.organizationId !== orgId()) throw ApiError.badRequest('Task is outside this organization');

  await KeyResultLink.findOrCreate({ where: { keyResultId: kr.id, issueId: issue.id } });
  if (kr.metricType !== 'linked_progress') await kr.update({ metricType: 'linked_progress' });
  return getGoal(goalId);
}

export async function removeKeyResultLink(goalId, keyResultId, linkId) {
  await loadGoal(goalId, { forUpdate: true });
  const kr = await KeyResult.findOne({ where: { id: keyResultId, goalId } });
  if (!kr) throw ApiError.notFound('Key result not found');
  const link = await KeyResultLink.findOne({ where: { id: linkId, keyResultId: kr.id } });
  if (!link) throw ApiError.notFound('Link not found');
  await link.destroy();
  return getGoal(goalId);
}

/** Search issues in the org to link (for the picker). */
export async function searchLinkableIssues(q = '', limit = 20) {
  const projects = await Project.findAll({
    where: { organizationId: orgId(), archivedAt: null },
    attributes: ['id'],
    raw: true,
  });
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return [];

  const where = { projectId: projectIds };
  if (q.trim()) {
    const like = { [likeOperator]: `%${q.trim()}%` };
    where[Op.or] = [{ title: like }, { key: like }];
  }

  const issues = await Issue.findAll({
    where,
    attributes: ['id', 'key', 'title', 'type', 'projectId'],
    include: [
      { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
      { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
    ],
    order: [['updatedAt', 'DESC']],
    limit: Math.min(limit, 50),
  });
  return issues.map((issue) => issue.toJSON());
}
