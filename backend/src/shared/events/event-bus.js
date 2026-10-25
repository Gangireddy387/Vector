import { EventEmitter } from 'node:events';

export const DomainEvents = Object.freeze({
  ISSUE_CREATED: 'issue.created',
  ISSUE_UPDATED: 'issue.updated',
  ISSUE_DELETED: 'issue.deleted',
  ISSUE_DUE_SOON: 'issue.due_soon',
  COMMENT_CREATED: 'comment.created',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',
  MEMBER_ADDED: 'project.member_added',
});

class DomainEventBus extends EventEmitter {
  /** Publishes asynchronously so request handlers never wait on side effects. */
  publish(event, payload) {
    setImmediate(() => this.emit(event, payload));
  }

  subscribe(event, handler) {
    this.on(event, async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[events] handler for "${event}" failed:`, error);
      }
    });
  }
}

export const eventBus = new DomainEventBus();
eventBus.setMaxListeners(50);
