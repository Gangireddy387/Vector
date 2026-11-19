import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { formatActorName, notifyChannelsForProject } from './channel-notify.service.js';

const issueLink = (issue) => `/issues/${issue.key}`;

async function onIssueCreated({ issue, actorId, context }) {
  if (!issue?.assigneeId) return;
  if (issue.type === 'subtask' && (context?.isSubtaskOf || context?.source === 'automation')) return;
  const name = await formatActorName(actorId);
  await notifyChannelsForProject(issue.projectId, 'assigned', {
    title: `${name} assigned ${issue.key}`,
    body: issue.title,
    link: issueLink(issue),
  });
}

async function onIssueUpdated({ issue, changes, actorId }) {
  if (!changes?.assigneeId?.to || !issue) return;
  const name = await formatActorName(actorId);
  await notifyChannelsForProject(issue.projectId, 'assigned', {
    title: `${name} assigned ${issue.key}`,
    body: issue.title,
    link: issueLink(issue),
  });
}

async function onCommentCreated({ issue, comment, mentionedUserIds = [], actorId }) {
  if (!issue || !comment?.body) return;
  const name = await formatActorName(actorId);
  const preview = String(comment.body)
    .replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
    .slice(0, 200);
  const mentionNote = mentionedUserIds.length ? ` (mentioned ${mentionedUserIds.length})` : '';
  await notifyChannelsForProject(issue.projectId, 'commented', {
    title: `${name} commented on ${issue.key}${mentionNote}`,
    body: preview,
    link: issueLink(issue),
  });
}

async function onIssueDueSoon({ issue }) {
  if (!issue) return;
  const today = toDateOnly(new Date());
  const when = issue.dueDate < today ? 'is overdue' : issue.dueDate === today ? 'is due today' : `is due on ${issue.dueDate}`;
  await notifyChannelsForProject(issue.projectId, 'due_soon', {
    title: `${issue.key} ${when}`,
    body: issue.title,
    link: issueLink(issue),
  });
}

async function onSprintStarted({ sprint, actorId }) {
  if (!sprint?.projectId) return;
  const name = await formatActorName(actorId);
  await notifyChannelsForProject(sprint.projectId, 'sprint_started', {
    title: `${name} started ${sprint.name}`,
    body: sprint.goal ?? null,
    link: `/projects/${sprint.projectId}/backlog`,
  });
}

export function registerChannelNotifyListeners() {
  eventBus.subscribe(DomainEvents.ISSUE_CREATED, onIssueCreated);
  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, onIssueUpdated);
  eventBus.subscribe(DomainEvents.COMMENT_CREATED, onCommentCreated);
  eventBus.subscribe(DomainEvents.ISSUE_DUE_SOON, onIssueDueSoon);
  eventBus.subscribe(DomainEvents.SPRINT_STARTED, onSprintStarted);
}
