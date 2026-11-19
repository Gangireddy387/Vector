import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { deliverOrganizationEvent, deliverProjectEvent } from './webhook.service.js';

function issueData(issue, extra = {}) {
  return {
    issue: {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      status: issue.status?.name ?? null,
      statusId: issue.statusId ?? null,
      projectId: issue.projectId,
      assigneeId: issue.assigneeId ?? null,
      dueDate: issue.dueDate ?? null,
    },
    ...extra,
  };
}

async function onIssueCreated({ issue, actorId }) {
  if (!issue?.projectId) return;
  await deliverProjectEvent(issue.projectId, DomainEvents.ISSUE_CREATED, issueData(issue), { actorId });
}

async function onIssueUpdated({ issue, changes, actorId }) {
  if (!issue?.projectId) return;
  await deliverProjectEvent(issue.projectId, DomainEvents.ISSUE_UPDATED, issueData(issue, { changes: changes ?? {} }), {
    actorId,
  });
}

async function onIssueDeleted({ issue, actorId }) {
  if (!issue?.projectId) return;
  await deliverProjectEvent(issue.projectId, DomainEvents.ISSUE_DELETED, issueData(issue), { actorId });
}

async function onCommentCreated({ issue, comment, actorId }) {
  if (!issue?.projectId || !comment) return;
  await deliverProjectEvent(
    issue.projectId,
    DomainEvents.COMMENT_CREATED,
    issueData(issue, {
      comment: {
        id: comment.id,
        body: String(comment.body || '').slice(0, 2000),
        authorId: comment.authorId ?? actorId ?? null,
      },
    }),
    { actorId },
  );
}

async function onIssueDueSoon({ issue }) {
  if (!issue?.projectId) return;
  await deliverProjectEvent(issue.projectId, DomainEvents.ISSUE_DUE_SOON, issueData(issue));
}

async function onSprintStarted({ sprint, actorId }) {
  if (!sprint?.projectId) return;
  await deliverProjectEvent(
    sprint.projectId,
    DomainEvents.SPRINT_STARTED,
    {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal ?? null,
        projectId: sprint.projectId,
        startDate: sprint.startDate ?? null,
        endDate: sprint.endDate ?? null,
      },
    },
    { actorId },
  );
}

async function onSprintCompleted({ sprint, actorId }) {
  if (!sprint?.projectId) return;
  await deliverProjectEvent(
    sprint.projectId,
    DomainEvents.SPRINT_COMPLETED,
    {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal ?? null,
        projectId: sprint.projectId,
        startDate: sprint.startDate ?? null,
        endDate: sprint.endDate ?? null,
      },
    },
    { actorId },
  );
}

async function onMemberAdded({ project, user, actorId }) {
  const organizationId = project?.organizationId;
  if (!organizationId) return;
  await deliverOrganizationEvent(
    organizationId,
    DomainEvents.MEMBER_ADDED,
    {
      project: { id: project.id, key: project.key, name: project.name },
      member: { userId: user?.id ?? null, name: user?.name ?? null, email: user?.email ?? null },
    },
    { actorId },
  );
}

export function registerWebhookListeners() {
  eventBus.subscribe(DomainEvents.ISSUE_CREATED, onIssueCreated);
  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, onIssueUpdated);
  eventBus.subscribe(DomainEvents.ISSUE_DELETED, onIssueDeleted);
  eventBus.subscribe(DomainEvents.COMMENT_CREATED, onCommentCreated);
  eventBus.subscribe(DomainEvents.ISSUE_DUE_SOON, onIssueDueSoon);
  eventBus.subscribe(DomainEvents.SPRINT_STARTED, onSprintStarted);
  eventBus.subscribe(DomainEvents.SPRINT_COMPLETED, onSprintCompleted);
  eventBus.subscribe(DomainEvents.MEMBER_ADDED, onMemberAdded);
}
