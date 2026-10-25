import { DomainEvents, eventBus } from '../events/event-bus.js';
import { emitToProject } from './socket.js';

/** Broadcasts lightweight change signals; clients refetch what they display. */
export function registerRealtimeListeners() {
  const broadcastIssueChange = (action) => ({ issue, actorId }) =>
    emitToProject(issue.projectId, 'issue:changed', { action, issueId: issue.id, key: issue.key, actorId });

  eventBus.subscribe(DomainEvents.ISSUE_CREATED, broadcastIssueChange('created'));
  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, broadcastIssueChange('updated'));
  eventBus.subscribe(DomainEvents.ISSUE_DELETED, broadcastIssueChange('deleted'));
  eventBus.subscribe(DomainEvents.COMMENT_CREATED, ({ issue, comment }) =>
    emitToProject(issue.projectId, 'comment:created', { issueId: issue.id, commentId: comment.id }),
  );
  eventBus.subscribe(DomainEvents.SPRINT_STARTED, ({ sprint }) =>
    emitToProject(sprint.projectId, 'sprint:changed', { sprintId: sprint.id }),
  );
  eventBus.subscribe(DomainEvents.SPRINT_COMPLETED, ({ sprint }) =>
    emitToProject(sprint.projectId, 'sprint:changed', { sprintId: sprint.id }),
  );
}
