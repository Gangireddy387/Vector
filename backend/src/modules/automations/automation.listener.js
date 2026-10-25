import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { runAutomations } from './automation.engine.js';

const FIELD_TRIGGERS = {
  statusId: 'issue.status_changed',
  assigneeId: 'issue.assigned',
  priority: 'issue.priority_changed',
};

export function registerAutomationListeners() {
  eventBus.subscribe(DomainEvents.ISSUE_CREATED, (payload) => runAutomations('issue.created', payload));

  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, async (payload) => {
    const changedFields = Object.keys(payload.changes).filter((field) => field !== 'position');
    if (!changedFields.length) return;
    await runAutomations('issue.updated', payload);
    for (const field of changedFields) {
      if (FIELD_TRIGGERS[field]) await runAutomations(FIELD_TRIGGERS[field], payload);
    }
  });

  eventBus.subscribe(DomainEvents.COMMENT_CREATED, (payload) => runAutomations('comment.created', payload));
  eventBus.subscribe(DomainEvents.ISSUE_DUE_SOON, (payload) => runAutomations('issue.due_soon', payload));
}
