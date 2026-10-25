import { Issue, Project, Status } from '../../database/models.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { updateIssue } from './issue.service.js';

/** Closes a parent issue automatically once every one of its sub-tasks is done. */
async function closeParentWhenSubtasksDone({ issue, changes, context }) {
  if (!changes.statusId || !issue.parentId || issue.status?.category !== 'done') return;

  const project = await Project.findByPk(issue.projectId, { attributes: ['id', 'settings'] });
  if (project.settings?.autoCloseParent === false) return;

  const siblings = await Issue.findAll({
    where: { parentId: issue.parentId },
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });
  if (!siblings.every((sibling) => sibling.status.category === 'done')) return;

  const parent = await Issue.findByPk(issue.parentId, { include: [{ model: Status, as: 'status', attributes: ['category'] }] });
  if (!parent || parent.status.category === 'done') return;

  const doneStatus = await Status.findOne({ where: { projectId: issue.projectId, category: 'done' }, order: [['position', 'ASC']] });
  if (!doneStatus) return;

  await updateIssue(parent.id, { statusId: doneStatus.id }, null, {
    source: 'system',
    reason: 'All sub-tasks were completed',
    automationDepth: (context?.automationDepth ?? 0) + 1,
  });
}

export function registerIssueListeners() {
  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, closeParentWhenSubtasksDone);
}
