export const AUTOMATION_TRIGGERS = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'issue.assigned',
  'issue.priority_changed',
  'comment.created',
  'issue.due_soon',
];

export const CONDITION_FIELDS = [
  'type',
  'priority',
  'statusId',
  'statusCategory',
  'fromStatusId',
  'assigneeId',
  'labelId',
  'title',
  'storyPoints',
  /** Value comes from `customFieldId` + issue custom field values. */
  'customField',
];

/** Operators allowed per custom-field type. */
export const CUSTOM_FIELD_OPERATORS = {
  text: ['equals', 'contains', 'is_empty', 'is_not_empty'],
  url: ['equals', 'contains', 'is_empty', 'is_not_empty'],
  number: ['equals', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  date: ['equals', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  select: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  multi_select: ['equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  checkbox: ['equals', 'is_empty', 'is_not_empty'],
};

export const CONDITION_OPERATORS = ['equals', 'not_equals', 'in', 'not_in', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt'];

export const ASSIGN_STRATEGIES = ['user', 'reporter', 'unassign', 'round_robin', 'least_loaded', 'project_lead'];

export const RECIPIENT_GROUPS = ['assignee', 'reporter', 'watchers', 'project_admins'];

/** Prevents rule chains (rule A triggers rule B triggers rule A ...) from running forever. */
export const MAX_AUTOMATION_DEPTH = 3;
