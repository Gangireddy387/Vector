import { Op, literal } from 'sequelize';
import {
  Attachment,
  Issue,
  IssueLabel,
  IssueLink,
  IssueTemplate,
  IssueWatcher,
  Label,
  Project,
  ProjectMember,
  Sprint,
  Status,
  User,
  WorkLog,
} from '../../database/models.js';
import { likeOperator } from '../../database/connection.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { toDateOnly, toList } from '../../shared/utils/query.js';
import { logActivity } from '../activity/activity.service.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';
import { assertProjectRole, getMemberProjectIds, loadIssueWithAccess } from '../projects/project-access.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { pickAssignee } from './issue-assignment.js';
import {
  ISSUE_REFERENCE_ATTRIBUTES,
  STATUS_SUMMARY_ATTRIBUTES,
  decorateIssues,
  issueDetailInclude,
  issueEventInclude,
  issueListInclude,
} from './issue.queries.js';

const POSITION_GAP = 1024;
const TRACKED_FIELDS = [
  'title', 'description', 'type', 'priority', 'statusId', 'assigneeId', 'parentId',
  'sprintId', 'storyPoints', 'estimateMinutes', 'startDate', 'dueDate', 'position',
];
const SILENT_FIELDS = new Set(['position']);
const FIELD_LABELS = { statusId: 'status', assigneeId: 'assignee', parentId: 'parent', sprintId: 'sprint' };
const PRIORITY_SORT = literal(
  `CASE "Issue"."priority" WHEN 'highest' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END`,
);

const LINK_LABELS = {
  blocks: { outward: 'blocks', inward: 'is blocked by' },
  relates_to: { outward: 'relates to', inward: 'relates to' },
  duplicates: { outward: 'duplicates', inward: 'is duplicated by' },
};

const normalize = (value) => (value === undefined || value === null || value === '' ? null : String(value));
const isSame = (a, b) => normalize(a) === normalize(b);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextPosition(projectId) {
  const max = await Issue.max('position', { where: { projectId } });
  return (Number.isFinite(max) ? max : 0) + POSITION_GAP;
}

const loadEventIssue = async (issueId) => (await Issue.findByPk(issueId, { include: issueEventInclude() }))?.toJSON();

async function describeValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  switch (field) {
    case 'statusId':
      return (await Status.findByPk(value, { attributes: ['name'] }))?.name ?? null;
    case 'assigneeId':
      return (await User.findByPk(value, { attributes: ['name'] }))?.name ?? null;
    case 'sprintId':
      return (await Sprint.findByPk(value, { attributes: ['name'] }))?.name ?? null;
    case 'parentId':
      return (await Issue.findByPk(value, { attributes: ['key'] }))?.key ?? null;
    case 'description':
      return null;
    default:
      return value;
  }
}

export async function addWatchers(issueId, userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length) await IssueWatcher.bulkCreate(unique.map((userId) => ({ issueId, userId })), { ignoreDuplicates: true });
}

/** Validates that every referenced record belongs to the same project. Returns the resolved status. */
async function assertRelations(projectId, data, currentIssueId = null) {
  let status = null;
  if (data.statusId) {
    status = await Status.findOne({ where: { id: data.statusId, projectId } });
    if (!status) throw ApiError.badRequest('Status does not belong to this project');
  }
  if (data.assigneeId) {
    const isMember = await ProjectMember.count({ where: { projectId, userId: data.assigneeId } });
    if (!isMember) throw ApiError.badRequest('Assignee must be a project member');
  }
  if (data.sprintId) {
    const sprint = await Sprint.findOne({ where: { id: data.sprintId, projectId } });
    if (!sprint) throw ApiError.badRequest('Sprint does not belong to this project');
    if (sprint.state === 'completed') throw ApiError.badRequest('Cannot add tasks to a completed sprint');
  }
  if (data.parentId) {
    if (data.parentId === currentIssueId) throw ApiError.badRequest('A task cannot be its own parent');
    const parent = await Issue.findOne({ where: { id: data.parentId, projectId } });
    if (!parent) throw ApiError.badRequest('Parent task does not belong to this project');
    if (parent.type === 'subtask') throw ApiError.badRequest('Sub-tasks cannot have their own sub-tasks');
  }
  if (data.labelIds?.length) {
    const unique = [...new Set(data.labelIds)];
    const count = await Label.count({ where: { id: unique, projectId } });
    if (count !== unique.length) throw ApiError.badRequest('One or more labels do not belong to this project');
  }
  return status;
}

async function applyTemplate(input) {
  const template = await IssueTemplate.findOne({ where: { id: input.templateId, projectId: input.projectId } });
  if (!template) throw ApiError.badRequest('Template not found in this project');
  const title = template.titlePrefix && !input.title.startsWith(template.titlePrefix)
    ? `${template.titlePrefix} ${input.title}`
    : input.title;
  return {
    ...input,
    title,
    type: input.type ?? template.issueType,
    priority: input.priority ?? template.priority,
    description: input.description ?? template.body,
    storyPoints: input.storyPoints ?? template.storyPoints,
    labelIds: input.labelIds?.length ? input.labelIds : template.labelIds,
    subtaskTitles: input.subtaskTitles?.length ? input.subtaskTitles : template.subtaskTitles,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Builds a column condition matching any of `ids`, optionally also matching NULL. */
function matchIdsOrNull(ids, includeNull) {
  if (!includeNull) return { [Op.in]: ids };
  if (!ids.length) return { [Op.is]: null };
  return { [Op.or]: [{ [Op.in]: ids }, { [Op.is]: null }] };
}

async function buildListWhere(userId, filters) {
  let projectIds;
  if (filters.projectId) {
    await assertProjectRole(filters.projectId, userId);
    projectIds = [filters.projectId];
  } else {
    projectIds = await getMemberProjectIds(userId);
  }
  const where = { projectId: projectIds };

  const resolveUser = (value) => (value === 'me' ? userId : value === 'unassigned' ? null : value);
  const assignees = toList(filters.assigneeId).map(resolveUser);
  if (assignees.length) where.assigneeId = matchIdsOrNull(assignees.filter(Boolean), assignees.includes(null));
  const reporters = toList(filters.reporterId).map(resolveUser).filter(Boolean);
  if (reporters.length) where.reporterId = reporters;

  const statusIds = toList(filters.statusId);
  const categories = toList(filters.statusCategory);
  if (categories.length) {
    const statuses = await Status.findAll({ where: { projectId: projectIds, category: categories }, attributes: ['id'], raw: true });
    const categoryStatusIds = statuses.map((status) => status.id);
    where.statusId = statusIds.length ? statusIds.filter((id) => categoryStatusIds.includes(id)) : categoryStatusIds;
  } else if (statusIds.length) {
    where.statusId = statusIds;
  }

  if (toList(filters.type).length) where.type = toList(filters.type);
  if (toList(filters.priority).length) where.priority = toList(filters.priority);

  const sprintFilter = toList(filters.sprintId);
  if (sprintFilter.length) {
    const ids = sprintFilter.filter((value) => !['backlog', 'active'].includes(value));
    if (sprintFilter.includes('active')) {
      const active = await Sprint.findAll({ where: { projectId: projectIds, state: 'active' }, attributes: ['id'], raw: true });
      ids.push(...active.map((sprint) => sprint.id));
    }
    where.sprintId = matchIdsOrNull(ids, sprintFilter.includes('backlog'));
  }

  if (filters.parentId === 'none') where.parentId = null;
  else if (filters.parentId) where.parentId = filters.parentId;

  const labelIds = toList(filters.labelId);
  if (labelIds.length) {
    const tagged = await IssueLabel.findAll({ where: { labelId: labelIds }, attributes: ['issueId'], raw: true });
    where.id = [...new Set(tagged.map((row) => row.issueId))];
  }

  if (filters.q) {
    const term = `%${filters.q}%`;
    where[Op.or] = [{ title: { [likeOperator]: term } }, { key: { [likeOperator]: term } }];
  }

  const dueRange = {};
  if (filters.dueFrom) dueRange[Op.gte] = filters.dueFrom;
  if (filters.dueTo) dueRange[Op.lte] = filters.dueTo;
  if (filters.overdue === 'true') {
    dueRange[Op.lt] = toDateOnly(new Date());
    const doneStatuses = await Status.findAll({ where: { projectId: projectIds, category: 'done' }, attributes: ['id'], raw: true });
    where[Op.and] = [{ statusId: { [Op.notIn]: doneStatuses.map((status) => status.id) } }];
  }
  if (Object.getOwnPropertySymbols(dueRange).length) where.dueDate = { ...dueRange, [Op.ne]: null };

  return where;
}

function buildOrder({ sort, order }) {
  const direction = order.toUpperCase();
  switch (sort) {
    case 'priority':
      return [[PRIORITY_SORT, direction === 'ASC' ? 'DESC' : 'ASC'], ['position', 'ASC']];
    case 'dueDate':
      return [['dueDate', direction], ['position', 'ASC']];
    case 'key':
      return [['number', direction]];
    case 'createdAt':
    case 'updatedAt':
      return [[sort, direction]];
    default:
      return [['position', direction]];
  }
}

export async function listIssues(userId, filters) {
  const where = await buildListWhere(userId, filters);
  const { rows, count } = await Issue.findAndCountAll({
    where,
    include: issueListInclude(),
    order: buildOrder(filters),
    limit: filters.limit,
    offset: filters.offset,
    distinct: true,
  });
  return { issues: await decorateIssues(rows), total: count };
}

/** Everything assigned to the user that is still open, plus work finished in the last 7 days. */
export async function listMyWork(userId) {
  const projectIds = await getMemberProjectIds(userId);
  const issues = await Issue.findAll({
    where: { assigneeId: userId, projectId: projectIds },
    include: issueListInclude(),
    order: [['dueDate', 'ASC'], ['position', 'ASC']],
  });
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const relevant = issues.filter(
    (issue) => issue.status.category !== 'done' || (issue.completedAt && issue.completedAt.getTime() >= weekAgo),
  );
  return decorateIssues(relevant);
}

function serializeLinks(outward, inward) {
  return [
    ...outward.map((link) => ({ id: link.id, type: link.type, direction: 'outward', label: LINK_LABELS[link.type].outward, issue: link.targetIssue })),
    ...inward.map((link) => ({ id: link.id, type: link.type, direction: 'inward', label: LINK_LABELS[link.type].inward, issue: link.sourceIssue })),
  ];
}

export async function getIssueDetail(issueIdOrKey, userId) {
  const { id } = await loadIssueWithAccess(issueIdOrKey, userId);
  const linkedIssueInclude = (as) => ({
    model: Issue,
    as,
    attributes: ISSUE_REFERENCE_ATTRIBUTES,
    include: [{ model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES }],
  });

  const [issue, subtasks, outward, inward, timeSpentMinutes] = await Promise.all([
    Issue.findByPk(id, { include: issueDetailInclude() }),
    Issue.findAll({
      where: { parentId: id },
      include: [
        { model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES },
        { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
      ],
      order: [['position', 'ASC']],
    }),
    IssueLink.findAll({ where: { sourceIssueId: id }, include: [linkedIssueInclude('targetIssue')] }),
    IssueLink.findAll({ where: { targetIssueId: id }, include: [linkedIssueInclude('sourceIssue')] }),
    WorkLog.sum('minutes', { where: { issueId: id } }),
  ]);

  const json = issue.toJSON();
  return {
    ...json,
    subtasks: subtasks.map((subtask) => subtask.toJSON()),
    links: serializeLinks(outward, inward),
    timeSpentMinutes: timeSpentMinutes ?? 0,
    isWatching: json.watchers.some((watcher) => watcher.id === userId),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Creates an issue. `context.source` records who triggered the change
 * ('user' | 'automation' | 'recurring' | 'system') for the audit trail and loop protection.
 */
export async function createIssue(rawInput, actor, context = {}) {
  const project = await Project.findByPk(rawInput.projectId);
  if (!project) throw ApiError.notFound('Project not found');

  const input = rawInput.templateId ? await applyTemplate(rawInput) : { ...rawInput };
  const type = input.type ?? (input.parentId ? 'subtask' : 'task');
  if (type === 'subtask' && !input.parentId) throw ApiError.badRequest('Sub-tasks need a parent task');

  let status = await assertRelations(project.id, input);
  if (!status) status = await Status.findOne({ where: { projectId: project.id }, order: [['position', 'ASC']] });

  let assigneeId = input.assigneeId ?? null;
  let autoAssigned = false;
  const strategy = project.settings?.autoAssign;
  if (input.assigneeId === undefined && strategy && strategy !== 'none') {
    assigneeId = await pickAssignee(project, strategy);
    autoAssigned = Boolean(assigneeId);
  }

  if (input.parentId && input.sprintId === undefined) {
    input.sprintId = (await Issue.findByPk(input.parentId, { attributes: ['sprintId'] }))?.sprintId ?? null;
  }

  await project.increment('issueCounter');
  await project.reload({ attributes: ['id', 'key', 'issueCounter'] });
  const number = project.issueCounter;

  const issue = await Issue.create({
    projectId: project.id,
    number,
    key: `${project.key}-${number}`,
    title: input.title,
    description: input.description ?? null,
    type,
    priority: input.priority ?? 'medium',
    statusId: status.id,
    assigneeId,
    reporterId: actor?.id ?? null,
    parentId: input.parentId ?? null,
    sprintId: input.sprintId ?? null,
    storyPoints: input.storyPoints ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    position: await nextPosition(project.id),
    completedAt: status.category === 'done' ? new Date() : null,
  });

  if (input.labelIds?.length) await issue.setLabels([...new Set(input.labelIds)]);
  await addWatchers(issue.id, [issue.reporterId, issue.assigneeId]);

  const meta = { source: context.source ?? 'user', ruleName: context.ruleName ?? null };
  await logActivity({ projectId: project.id, issueId: issue.id, actorId: actor?.id ?? null, action: 'created', meta });
  if (autoAssigned) {
    await logActivity({
      projectId: project.id,
      issueId: issue.id,
      action: 'auto_assigned',
      field: 'assignee',
      toValue: await describeValue('assigneeId', assigneeId),
      meta: { strategy },
    });
  }

  for (const subtaskTitle of input.subtaskTitles ?? []) {
    await createIssue(
      { projectId: project.id, title: subtaskTitle, parentId: issue.id, type: 'subtask', priority: issue.priority, assigneeId: issue.assigneeId },
      actor,
      { ...context, isSubtaskOf: issue.key },
    );
  }

  eventBus.publish(DomainEvents.ISSUE_CREATED, { issue: await loadEventIssue(issue.id), actorId: actor?.id ?? null, context });
  return issue;
}

export async function updateIssue(issueId, changes, actor, context = {}) {
  const issue = await Issue.findByPk(issueId, { include: [{ model: Label, as: 'labels', attributes: ['id', 'name'] }] });
  if (!issue) throw ApiError.notFound('Task not found');

  const diff = {};
  TRACKED_FIELDS.forEach((field) => {
    if (field in changes && !isSame(issue[field], changes[field])) diff[field] = { from: issue[field], to: changes[field] };
  });

  const nextType = changes.type ?? issue.type;
  const nextParentId = 'parentId' in changes ? changes.parentId : issue.parentId;
  if (nextType === 'subtask' && !nextParentId) throw ApiError.badRequest('Sub-tasks need a parent task');

  const relationChanges = Object.fromEntries(
    ['statusId', 'assigneeId', 'sprintId', 'parentId'].filter((field) => diff[field]).map((field) => [field, changes[field]]),
  );
  if (changes.labelIds) relationChanges.labelIds = changes.labelIds;
  const newStatus = await assertRelations(issue.projectId, relationChanges, issue.id);

  const updates = Object.fromEntries(Object.entries(diff).map(([field, value]) => [field, value.to ?? null]));
  if (newStatus) {
    updates.completedAt = newStatus.category === 'done' ? (issue.completedAt ?? new Date()) : null;
  }
  if (diff.dueDate) updates.dueReminderSentAt = null;
  if (Object.keys(updates).length) await issue.update(updates);

  if (changes.labelIds) {
    const before = issue.labels.map((label) => label.id).sort();
    const after = [...new Set(changes.labelIds)].sort();
    if (before.join() !== after.join()) {
      await issue.setLabels(after);
      const names = after.length ? (await Label.findAll({ where: { id: after }, attributes: ['name'], raw: true })).map((label) => label.name) : [];
      diff.labels = { from: issue.labels.map((label) => label.name).join(', ') || null, to: names.join(', ') || null };
    }
  }

  if (diff.assigneeId?.to) await addWatchers(issue.id, [diff.assigneeId.to]);

  const meaningfulFields = Object.keys(diff).filter((field) => !SILENT_FIELDS.has(field));
  for (const field of meaningfulFields) {
    await logActivity({
      projectId: issue.projectId,
      issueId: issue.id,
      actorId: actor?.id ?? null,
      action: 'updated',
      field: FIELD_LABELS[field] ?? field,
      fromValue: field === 'labels' ? diff.labels.from : await describeValue(field, diff[field].from),
      toValue: field === 'labels' ? diff.labels.to : await describeValue(field, diff[field].to),
      meta: { source: context.source ?? 'user', ruleName: context.ruleName ?? null, reason: context.reason ?? null },
    });
  }

  if (Object.keys(diff).length) {
    eventBus.publish(DomainEvents.ISSUE_UPDATED, {
      issue: await loadEventIssue(issue.id),
      changes: diff,
      actorId: actor?.id ?? null,
      context,
    });
  }
  return issue;
}

export async function deleteIssue(issueId, actor) {
  const issue = await Issue.findByPk(issueId);
  const subtaskIds = (await Issue.findAll({ where: { parentId: issueId }, attributes: ['id'], raw: true })).map((row) => row.id);
  const attachments = await Attachment.findAll({ where: { issueId: [issueId, ...subtaskIds] } });

  const snapshot = issue.toJSON();
  // Sub-tasks go with their parent; existing databases may still have a SET NULL constraint on parent_id.
  if (subtaskIds.length) await Issue.destroy({ where: { id: subtaskIds } });
  await issue.destroy();
  await Promise.all(attachments.map((attachment) => deleteStoredFile(attachment.storageKey)));
  await logActivity({ projectId: snapshot.projectId, actorId: actor?.id ?? null, action: 'deleted', toValue: `${snapshot.key} ${snapshot.title}` });
  eventBus.publish(DomainEvents.ISSUE_DELETED, { issue: snapshot, actorId: actor?.id ?? null });
}

export async function bulkUpdate(issueIds, changes, actor) {
  const issues = await Issue.findAll({ where: { id: issueIds }, include: [{ model: Label, as: 'labels', attributes: ['id'] }] });
  const projectIds = [...new Set(issues.map((issue) => issue.projectId))];
  await Promise.all(projectIds.map((projectId) => assertProjectRole(projectId, actor.id, 'member')));

  const { addLabelIds, ...fieldChanges } = changes;
  const results = [];
  for (const issue of issues) {
    const issueChanges = { ...fieldChanges };
    if (addLabelIds?.length) issueChanges.labelIds = [...new Set([...issue.labels.map((label) => label.id), ...addLabelIds])];
    results.push(await updateIssue(issue.id, issueChanges, actor, { source: 'user', bulk: true }));
  }
  return { updated: results.length };
}

export async function bulkDelete(issueIds, actor) {
  const issues = await Issue.findAll({ where: { id: issueIds } });
  const projectIds = [...new Set(issues.map((issue) => issue.projectId))];
  await Promise.all(projectIds.map((projectId) => assertProjectRole(projectId, actor.id, 'member')));
  for (const issue of issues) {
    if (await Issue.count({ where: { id: issue.id } })) await deleteIssue(issue.id, actor);
  }
  return { deleted: issues.length };
}

export async function setWatching(issueId, userId, watching) {
  if (watching) await addWatchers(issueId, [userId]);
  else await IssueWatcher.destroy({ where: { issueId, userId } });
}

export async function createLink(issue, { targetIssue, type }, actor) {
  const target = await loadIssueWithAccess(targetIssue, actor.id);
  if (target.id === issue.id) throw ApiError.badRequest('A task cannot be linked to itself');
  const where = { sourceIssueId: issue.id, targetIssueId: target.id, type };
  if (await IssueLink.count({ where })) throw ApiError.conflict('These tasks are already linked');
  const link = await IssueLink.create({ ...where, createdById: actor.id });
  await logActivity({ projectId: issue.projectId, issueId: issue.id, actorId: actor.id, action: 'linked', toValue: `${LINK_LABELS[type].outward} ${target.key}` });
  return link;
}

export async function deleteLink(linkId, actor) {
  const link = await IssueLink.findByPk(linkId, { include: [{ model: Issue, as: 'sourceIssue', attributes: ['id', 'projectId', 'key'] }] });
  if (!link) throw ApiError.notFound('Link not found');
  await assertProjectRole(link.sourceIssue.projectId, actor.id, 'member');
  await link.destroy();
}
