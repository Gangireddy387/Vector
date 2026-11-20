import { Op, literal } from 'sequelize';
import {
  Attachment,
  CustomField,
  Issue,
  IssueExternalLink,
  IssueAffectedVersion,
  IssueCustomFieldValue,
  IssueFixVersion,
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
  Version,
  WorkLog,
} from '../../database/models.js';
import { conditionMatches, isEmptyValue } from '../automations/automation.engine.js';
import { parseExternalIssueUrl, serializeExternalLink } from './issue-external-link.parse.js';
import {
  assertCustomFieldValues,
  formatFieldValueForActivity,
  loadIssueCustomFieldValues,
  setIssueCustomFieldValues,
} from '../custom-fields/custom-field.service.js';
import { createComment } from '../comments/comment.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { assertIssueFieldChanges, loadFieldAclContext } from '../projects/issue-field-acl.js';
import { assertStatusTransition } from '../workflow-transitions/workflow-transition.service.js';
import { likeOperator, writeTransaction } from '../../database/connection.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { toDateOnly, toList } from '../../shared/utils/query.js';
import { logActivity } from '../activity/activity.service.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';
import { removeIssueCalendarEvents, syncIssueDueToCalendar } from '../calendar/issue-calendar.sync.js';
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
const FIELD_LABELS = {
  statusId: 'status',
  assigneeId: 'assignee',
  parentId: 'parent',
  sprintId: 'sprint',
  fixVersions: 'fix versions',
  affectedVersions: 'affected versions',
};
const RELATION_ACTIVITY_FIELDS = new Set(['labels', 'fixVersions', 'affectedVersions']);
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

/** A task cannot be placed under one of its own descendants (A under B under A would loop forever). */
async function assertNotAncestor(issueId, parent) {
  let current = parent;
  for (let depth = 0; current && depth < 100; depth += 1) {
    if (current.id === issueId) throw ApiError.badRequest('A task cannot be placed under one of its own sub-tasks');
    current = current.parentId ? await Issue.findByPk(current.parentId, { attributes: ['id', 'parentId'] }) : null;
  }
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
    if (currentIssueId) await assertNotAncestor(currentIssueId, parent);
  }
  if (data.labelIds?.length) {
    const unique = [...new Set(data.labelIds)];
    const count = await Label.count({ where: { id: unique, projectId } });
    if (count !== unique.length) throw ApiError.badRequest('One or more labels do not belong to this project');
  }
  if (data.fixVersionIds?.length || data.affectedVersionIds?.length) {
    if (!(await projectHasFeature(projectId, 'releases'))) {
      throw ApiError.forbidden('The current plan does not include releases & versions');
    }
    const ids = [...new Set([...(data.fixVersionIds ?? []), ...(data.affectedVersionIds ?? [])])];
    if (ids.length) {
      const count = await Version.count({ where: { id: ids, projectId } });
      if (count !== ids.length) throw ApiError.badRequest('One or more versions do not belong to this project');
    }
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

  const parentFilter = toList(filters.parentId);
  if (parentFilter.length) {
    const epicIds = parentFilter.filter((value) => value !== 'none');
    where.parentId = matchIdsOrNull(epicIds, parentFilter.includes('none'));
  }

  const labelIds = toList(filters.labelId);
  if (labelIds.length) {
    const tagged = await IssueLabel.findAll({ where: { labelId: labelIds }, attributes: ['issueId'], raw: true });
    where.id = [...new Set(tagged.map((row) => row.issueId))];
  }

  const fixVersionIds = toList(filters.fixVersionId);
  if (fixVersionIds.length) {
    const tagged = await IssueFixVersion.findAll({
      where: { versionId: fixVersionIds },
      attributes: ['issueId'],
      raw: true,
    });
    const ids = [...new Set(tagged.map((row) => row.issueId))];
    where.id = where.id ? ids.filter((id) => where.id.includes(id)) : ids;
  }

  const affectedVersionIds = toList(filters.affectedVersionId);
  if (affectedVersionIds.length) {
    const tagged = await IssueAffectedVersion.findAll({
      where: { versionId: affectedVersionIds },
      attributes: ['issueId'],
      raw: true,
    });
    const ids = [...new Set(tagged.map((row) => row.issueId))];
    where.id = where.id ? ids.filter((id) => where.id.includes(id)) : ids;
  }

  if (filters.customFieldId) {
    const op = filters.customFieldOp || 'equals';
    let expected = filters.customFieldValue ?? null;
    if (expected != null && expected !== '' && ['true', 'false'].includes(String(expected).toLowerCase()) && op === 'equals') {
      expected = String(expected).toLowerCase() === 'true';
    } else if (expected != null && expected !== '' && !Number.isNaN(Number(expected)) && ['gt', 'lt', 'equals'].includes(op)) {
      const asNumber = Number(expected);
      if (String(expected).trim() !== '' && Number.isFinite(asNumber) && !/^\d{4}-\d{2}-\d{2}/.test(String(expected))) {
        expected = asNumber;
      }
    } else if (typeof expected === 'string' && expected.includes(',') && ['in', 'not_in'].includes(op)) {
      expected = expected.split(',').map((part) => part.trim()).filter(Boolean);
    }

    const rows = await IssueCustomFieldValue.findAll({
      where: { fieldId: filters.customFieldId },
      attributes: ['issueId', 'value'],
      raw: true,
    });

    let ids;
    if (op === 'is_empty') {
      const filled = new Set(rows.filter((row) => !isEmptyValue(row.value)).map((row) => row.issueId));
      const candidates = await Issue.findAll({
        where: { projectId: projectIds },
        attributes: ['id'],
        raw: true,
      });
      ids = candidates.map((row) => row.id).filter((id) => !filled.has(id));
    } else if (op === 'is_not_empty') {
      ids = [...new Set(rows.filter((row) => !isEmptyValue(row.value)).map((row) => row.issueId))];
    } else {
      ids = [
        ...new Set(
          rows
            .filter((row) =>
              conditionMatches(
                { field: 'customField', operator: op, value: expected, customFieldId: filters.customFieldId },
                { customFieldValues: [{ fieldId: filters.customFieldId, value: row.value }] },
              ),
            )
            .map((row) => row.issueId),
        ),
      ];
    }
    where.id = where.id ? ids.filter((id) => where.id.includes(id)) : ids;
  }

  if (filters.q) {
    const term = `%${String(filters.q).replace(/[%_]/g, ' ').trim()}%`;
    if (term !== '%%') {
      where[Op.or] = [
        { title: { [likeOperator]: term } },
        { key: { [likeOperator]: term } },
        { description: { [likeOperator]: term } },
      ];
    }
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

/** CSV of the filtered task list (capped) for portability / reporting. */
export async function exportIssuesCsv(userId, filters) {
  const limit = Math.min(Number(filters.limit) || 1000, 1000);
  const { issues } = await listIssues(userId, { ...filters, limit, offset: 0 });
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['key', 'title', 'type', 'status', 'priority', 'assignee', 'dueDate', 'storyPoints', 'labels', 'project', 'updatedAt'];
  const lines = [
    header.join(','),
    ...issues.map((issue) =>
      [
        issue.key,
        issue.title,
        issue.type,
        issue.status?.name ?? '',
        issue.priority,
        issue.assignee?.name ?? '',
        issue.dueDate ?? '',
        issue.storyPoints ?? '',
        (issue.labels ?? []).map((label) => label.name).join('; '),
        issue.project?.key ?? '',
        issue.updatedAt ?? '',
      ]
        .map(escape)
        .join(','),
    ),
  ];
  return lines.join('\n');
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

  const [issue, subtasks, outward, inward, externalLinks, timeSpentMinutes] = await Promise.all([
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
    IssueExternalLink.findAll({ where: { issueId: id }, order: [['createdAt', 'ASC']] }),
    WorkLog.sum('minutes', { where: { issueId: id } }),
  ]);

  const json = issue.toJSON();
  const customFieldMap = await loadIssueCustomFieldValues([id]);
  return {
    ...json,
    customFieldValues: customFieldMap.get(id) ?? [],
    subtasks: subtasks.map((subtask) => subtask.toJSON()),
    links: serializeLinks(outward, inward),
    externalLinks: externalLinks.map(serializeExternalLink),
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

  const position = await nextPosition(project.id);
  const customFieldValues =
    input.customFields && Object.keys(input.customFields).length
      ? await (async () => {
          if (!(await projectHasFeature(project.id, 'customFields'))) {
            throw ApiError.forbidden('The current plan does not include custom fields');
          }
          return assertCustomFieldValues(project.id, input.customFields);
        })()
      : null;
  // The number comes from the project's counter, locked for the transaction: two tasks created at the same moment
  // get different keys, and a failure leaves neither a used number nor half a task behind.
  const issue = await writeTransaction(async (transaction) => {
    const counter = await Project.findByPk(project.id, { attributes: ['id', 'key', 'issueCounter'], lock: transaction.LOCK.UPDATE, transaction });
    const number = counter.issueCounter + 1;
    await counter.update({ issueCounter: number }, { transaction });
    const created = await Issue.create(
      {
        projectId: project.id,
        number,
        key: `${counter.key}-${number}`,
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
        position,
        completedAt: status.category === 'done' ? new Date() : null,
      },
      { transaction },
    );
    if (input.labelIds?.length) await created.setLabels([...new Set(input.labelIds)], { transaction });
    if (input.fixVersionIds) await created.setFixVersions([...new Set(input.fixVersionIds)], { transaction });
    if (input.affectedVersionIds) {
      await created.setAffectedVersions([...new Set(input.affectedVersionIds)], { transaction });
    }
    if (customFieldValues) await setIssueCustomFieldValues(created.id, customFieldValues, { transaction });
    return created;
  });
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
  await syncIssueDueToCalendar(issue.id).catch((error) => console.warn(`[calendar] issue due sync failed: ${error.message}`));
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
  if (changes.fixVersionIds) relationChanges.fixVersionIds = changes.fixVersionIds;
  if (changes.affectedVersionIds) relationChanges.affectedVersionIds = changes.affectedVersionIds;
  const newStatus = await assertRelations(issue.projectId, relationChanges, issue.id);
  if (diff.statusId) {
    await assertStatusTransition(issue, changes.statusId, changes, context, actor);
  }

  const aclKeys = [
    ...Object.keys(diff).filter((field) => field !== 'statusId' && field !== 'position' && field !== 'labels'),
    ...(changes.labelIds ? ['labelIds'] : []),
    ...(changes.fixVersionIds ? ['fixVersionIds'] : []),
    ...(changes.affectedVersionIds ? ['affectedVersionIds'] : []),
    ...(changes.customFields && Object.keys(changes.customFields).length ? ['customFields'] : []),
  ];
  if (aclKeys.length) {
    const { project: aclProject, role: aclRole } = await loadFieldAclContext(issue.projectId, actor?.id ?? null);
    await assertIssueFieldChanges({
      project: aclProject,
      role: aclRole,
      actor,
      changedKeys: aclKeys,
      context,
    });
  }

  const updates = Object.fromEntries(Object.entries(diff).map(([field, value]) => [field, value.to ?? null]));
  if (newStatus) {
    updates.completedAt = newStatus.category === 'done' ? (issue.completedAt ?? new Date()) : null;
  }
  if (diff.dueDate) updates.dueReminderSentAt = null;
  if (Object.keys(updates).length) await issue.update(updates);

  if (diff.statusId && typeof changes.transitionComment === 'string' && changes.transitionComment.trim()) {
    await createComment(issue, actor, changes.transitionComment.trim(), context);
  }

  if (changes.labelIds) {
    const before = issue.labels.map((label) => label.id).sort();
    const after = [...new Set(changes.labelIds)].sort();
    if (before.join() !== after.join()) {
      await issue.setLabels(after);
      const names = after.length ? (await Label.findAll({ where: { id: after }, attributes: ['name'], raw: true })).map((label) => label.name) : [];
      diff.labels = { from: issue.labels.map((label) => label.name).join(', ') || null, to: names.join(', ') || null };
    }
  }

  if (changes.fixVersionIds) {
    const current = await issue.getFixVersions({ attributes: ['id', 'name'] });
    const before = current.map((row) => row.id).sort();
    const after = [...new Set(changes.fixVersionIds)].sort();
    if (before.join() !== after.join()) {
      await issue.setFixVersions(after);
      const names = after.length
        ? (await Version.findAll({ where: { id: after }, attributes: ['name'], raw: true })).map((row) => row.name)
        : [];
      diff.fixVersions = { from: current.map((row) => row.name).join(', ') || null, to: names.join(', ') || null };
    }
  }

  if (changes.affectedVersionIds) {
    const current = await issue.getAffectedVersions({ attributes: ['id', 'name'] });
    const before = current.map((row) => row.id).sort();
    const after = [...new Set(changes.affectedVersionIds)].sort();
    if (before.join() !== after.join()) {
      await issue.setAffectedVersions(after);
      const names = after.length
        ? (await Version.findAll({ where: { id: after }, attributes: ['name'], raw: true })).map((row) => row.name)
        : [];
      diff.affectedVersions = {
        from: current.map((row) => row.name).join(', ') || null,
        to: names.join(', ') || null,
      };
    }
  }

  let customFieldsChanged = false;
  if (changes.customFields && Object.keys(changes.customFields).length) {
    if (!(await projectHasFeature(issue.projectId, 'customFields'))) {
      throw ApiError.forbidden('The current plan does not include custom fields');
    }
    const normalized = await assertCustomFieldValues(issue.projectId, changes.customFields);
    const fieldIds = Object.keys(normalized);
    const [fields, existingRows] = await Promise.all([
      CustomField.findAll({ where: { id: fieldIds, projectId: issue.projectId } }),
      loadIssueCustomFieldValues([issue.id]),
    ]);
    const existing = new Map((existingRows.get(issue.id) ?? []).map((row) => [row.fieldId, row.value]));
    const byId = new Map(fields.map((field) => [field.id, field]));
    await setIssueCustomFieldValues(issue.id, normalized);
    for (const fieldId of fieldIds) {
      const field = byId.get(fieldId);
      if (!field) continue;
      const from = existing.has(fieldId) ? existing.get(fieldId) : null;
      const to = normalized[fieldId];
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      customFieldsChanged = true;
      await logActivity({
        projectId: issue.projectId,
        issueId: issue.id,
        actorId: actor?.id ?? null,
        action: 'updated',
        field: field.name,
        fromValue: formatFieldValueForActivity(field, from),
        toValue: formatFieldValueForActivity(field, to),
        meta: { source: context.source ?? 'user', ruleName: context.ruleName ?? null, customFieldId: field.id },
      });
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
      fromValue: RELATION_ACTIVITY_FIELDS.has(field) ? diff[field].from : await describeValue(field, diff[field].from),
      toValue: RELATION_ACTIVITY_FIELDS.has(field) ? diff[field].to : await describeValue(field, diff[field].to),
      meta: { source: context.source ?? 'user', ruleName: context.ruleName ?? null, reason: context.reason ?? null },
    });
  }

  if (Object.keys(diff).length || customFieldsChanged) {
    eventBus.publish(DomainEvents.ISSUE_UPDATED, {
      issue: await loadEventIssue(issue.id),
      changes: customFieldsChanged ? { ...diff, customFields: true } : diff,
      actorId: actor?.id ?? null,
      context,
    });
  }
  if (diff.dueDate || diff.assigneeId || diff.statusId) {
    await syncIssueDueToCalendar(issue.id).catch((error) => console.warn(`[calendar] issue due sync failed: ${error.message}`));
  }
  return issue;
}

export async function deleteIssue(issueId, actor) {
  const issue = await Issue.findByPk(issueId);
  const subtaskIds = (await Issue.findAll({ where: { parentId: issueId }, attributes: ['id'], raw: true })).map((row) => row.id);
  const attachments = await Attachment.findAll({ where: { issueId: [issueId, ...subtaskIds] } });

  const snapshot = issue.toJSON();
  // Sub-tasks go with their parent (existing databases may still have a SET NULL constraint on parent_id); both or neither.
  await writeTransaction(async (transaction) => {
    if (subtaskIds.length) await Issue.destroy({ where: { id: subtaskIds }, transaction });
    await issue.destroy({ transaction });
  });
  await Promise.all(attachments.map((attachment) => deleteStoredFile(attachment.storageKey)));
  await removeIssueCalendarEvents(issueId).catch(() => undefined);
  await logActivity({ projectId: snapshot.projectId, actorId: actor?.id ?? null, action: 'deleted', toValue: `${snapshot.key} ${snapshot.title}` });
  eventBus.publish(DomainEvents.ISSUE_DELETED, { issue: snapshot, actorId: actor?.id ?? null });
}

export async function bulkUpdate(issueIds, changes, actor) {
  const issues = await Issue.findAll({ where: { id: issueIds }, include: [{ model: Label, as: 'labels', attributes: ['id'] }] });
  const projectIds = [...new Set(issues.map((issue) => issue.projectId))];
  await Promise.all(projectIds.map((projectId) => assertProjectRole(projectId, actor.id, 'member')));

  const { addLabelIds, statusCategory, ...fieldChanges } = changes;
  /** Per project: first status in the requested category (lowest position). */
  let statusByProject = null;
  if (statusCategory) {
    const statuses = await Status.findAll({
      where: { projectId: projectIds, category: statusCategory },
      order: [['position', 'ASC']],
      attributes: ['id', 'projectId', 'position'],
    });
    statusByProject = new Map();
    for (const status of statuses) {
      if (!statusByProject.has(status.projectId)) statusByProject.set(status.projectId, status.id);
    }
  }

  const results = [];
  for (const issue of issues) {
    const issueChanges = { ...fieldChanges };
    if (statusByProject) {
      const statusId = statusByProject.get(issue.projectId);
      if (!statusId) throw ApiError.badRequest(`No “${statusCategory.replaceAll('_', ' ')}” status in one of the selected projects`);
      issueChanges.statusId = statusId;
    }
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

/** Add a project member as a watcher on the issue. */
export async function addIssueWatcher(issue, userId) {
  const isMember = await ProjectMember.count({ where: { projectId: issue.projectId, userId } });
  if (!isMember) throw ApiError.badRequest('Watcher must be a project member');
  await addWatchers(issue.id, [userId]);
}

export async function createLink(issue, { targetIssue, type }, actor) {
  const target = await loadIssueWithAccess(targetIssue, actor.id);
  if (target.id === issue.id) throw ApiError.badRequest('A task cannot be linked to itself');
  // Links stay inside one organization, so nobody in the other one sees a task they have no access to.
  const projects = await Project.findAll({ where: { id: [...new Set([issue.projectId, target.projectId])] }, attributes: ['organizationId'], raw: true });
  if (new Set(projects.map((project) => project.organizationId)).size > 1) throw ApiError.badRequest('Tasks can only be linked within the same organization');
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

/** Paste a GitHub / GitLab (or other https) URL onto a Vector issue. */
export async function createExternalLink(issue, { url }, actor) {
  if (!(await projectHasFeature(issue.projectId, 'vcsLinks'))) {
    throw ApiError.forbidden('GitHub & GitLab links are not included in your plan');
  }
  const parsed = parseExternalIssueUrl(url);
  if (await IssueExternalLink.count({ where: { issueId: issue.id, url: parsed.url } })) {
    throw ApiError.conflict('This URL is already linked');
  }
  const link = await IssueExternalLink.create({
    issueId: issue.id,
    provider: parsed.provider,
    url: parsed.url,
    host: parsed.host,
    owner: parsed.owner,
    repo: parsed.repo,
    number: parsed.number,
    kind: parsed.kind,
    label: parsed.label,
    createdById: actor.id,
  });
  await logActivity({
    projectId: issue.projectId,
    issueId: issue.id,
    actorId: actor.id,
    action: 'external_linked',
    toValue: parsed.label,
  });
  return link;
}

export async function deleteExternalLink(linkId, actor) {
  const link = await IssueExternalLink.findByPk(linkId, {
    include: [{ model: Issue, as: 'issue', attributes: ['id', 'projectId'] }],
  });
  if (!link) throw ApiError.notFound('External link not found');
  await assertProjectRole(link.issue.projectId, actor.id, 'member');
  await link.destroy();
}
