/** Domain events that org webhook endpoints may subscribe to. */
export const WEBHOOK_EVENTS = Object.freeze([
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'comment.created',
  'issue.due_soon',
  'sprint.started',
  'sprint.completed',
  'project.member_added',
  /** Workspace audit / SIEM stream (Activity tab events). */
  'workspace.audit.created',
]);

export const WEBHOOK_EVENT_SET = new Set(WEBHOOK_EVENTS);

export const MAX_WEBHOOK_ENDPOINTS = 10;

export const WEBHOOK_SECRET_PREFIX = 'whsec_';
