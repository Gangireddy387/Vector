import { AlarmClock, Bug, CircleCheck, Flame, ListChecks, MessageSquareReply, PlayCircle, UserCheck, Users } from 'lucide-vue-next'
import type { Component } from 'vue'
import { ISSUE_TYPE_META, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import type {
  AutomationAction,
  AutomationActionType,
  AutomationCondition,
  AutomationTrigger,
  ConditionField,
  ConditionOperator,
  IssuePriority,
  IssueType,
  ProjectDetail,
  StatusCategory,
} from '@/types/models'
import type { RuleInput } from './automation.api'

export const TRIGGER_OPTIONS: Array<{ value: AutomationTrigger; label: string; sentence: string }> = [
  { value: 'issue.created', label: 'Issue created', sentence: 'When an issue is created' },
  { value: 'issue.status_changed', label: 'Status changed', sentence: 'When the status changes' },
  { value: 'issue.assigned', label: 'Assignee changed', sentence: 'When the assignee changes' },
  { value: 'issue.priority_changed', label: 'Priority changed', sentence: 'When the priority changes' },
  { value: 'issue.updated', label: 'Any field updated', sentence: 'When an issue is updated' },
  { value: 'comment.created', label: 'Comment added', sentence: 'When someone comments' },
  { value: 'issue.due_soon', label: 'Due date approaching', sentence: 'When the due date is near' },
]

export type ValueKind = 'status' | 'category' | 'type' | 'priority' | 'member' | 'label' | 'text' | 'number'

export const CONDITION_FIELD_OPTIONS: Array<{ value: ConditionField; label: string; kind: ValueKind }> = [
  { value: 'type', label: 'Type', kind: 'type' },
  { value: 'priority', label: 'Priority', kind: 'priority' },
  { value: 'statusId', label: 'Status', kind: 'status' },
  { value: 'statusCategory', label: 'Status category', kind: 'category' },
  { value: 'fromStatusId', label: 'Previous status', kind: 'status' },
  { value: 'assigneeId', label: 'Assignee', kind: 'member' },
  { value: 'labelId', label: 'Label', kind: 'label' },
  { value: 'title', label: 'Title', kind: 'text' },
  { value: 'storyPoints', label: 'Story points', kind: 'number' },
]

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  in: 'is any of',
  not_in: 'is none of',
  contains: 'contains',
  is_empty: 'is empty',
  is_not_empty: 'is set',
  gt: 'is greater than',
  lt: 'is less than',
}

export const OPERATORS_BY_KIND: Record<ValueKind, ConditionOperator[]> = {
  status: ['equals', 'not_equals', 'in', 'not_in'],
  category: ['equals', 'not_equals'],
  type: ['equals', 'not_equals', 'in', 'not_in'],
  priority: ['equals', 'not_equals', 'in', 'not_in'],
  member: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  label: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  text: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  number: ['equals', 'gt', 'lt', 'is_empty', 'is_not_empty'],
}

export const VALUELESS_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty']
export const MULTI_VALUE_OPERATORS: ConditionOperator[] = ['in', 'not_in']

export const ACTION_OPTIONS: Array<{ value: AutomationActionType; label: string }> = [
  { value: 'assign', label: 'Assign issue' },
  { value: 'set_status', label: 'Change status' },
  { value: 'set_priority', label: 'Set priority' },
  { value: 'add_labels', label: 'Add labels' },
  { value: 'remove_labels', label: 'Remove labels' },
  { value: 'add_comment', label: 'Add a comment' },
  { value: 'notify', label: 'Send in-app notification' },
  { value: 'send_email', label: 'Send email' },
  { value: 'set_due_date', label: 'Set due date' },
  { value: 'set_story_points', label: 'Set story points' },
  { value: 'move_to_active_sprint', label: 'Move to active sprint' },
  { value: 'create_subtasks', label: 'Create sub-tasks' },
]

export const ASSIGN_STRATEGY_OPTIONS = [
  { value: 'least_loaded', label: 'Least busy member' },
  { value: 'round_robin', label: 'Next member (round robin)' },
  { value: 'project_lead', label: 'Project lead' },
  { value: 'reporter', label: 'Reporter' },
  { value: 'user', label: 'A specific person' },
  { value: 'unassign', label: 'Nobody (unassign)' },
] as const

export const RECIPIENT_OPTIONS = [
  { value: 'assignee', label: 'Assignee' },
  { value: 'reporter', label: 'Reporter' },
  { value: 'watchers', label: 'Watchers' },
  { value: 'project_admins', label: 'Project admins' },
] as const

export const TEMPLATE_VARIABLES = ['{{issue.key}}', '{{issue.title}}', '{{issue.status}}', '{{issue.priority}}', '{{actor.name}}']

export function defaultParams(type: AutomationActionType): Record<string, unknown> {
  switch (type) {
    case 'assign':
      return { strategy: 'least_loaded' }
    case 'set_priority':
      return { priority: 'high' }
    case 'add_labels':
    case 'remove_labels':
      return { labelIds: [] }
    case 'add_comment':
      return { body: '' }
    case 'notify':
      return { recipients: ['assignee'], userIds: [], message: '{{issue.key}} needs your attention' }
    case 'send_email':
      return { recipients: ['assignee'], userIds: [], subject: 'Update on {{issue.key}}', message: '' }
    case 'set_due_date':
      return { daysFromNow: 3 }
    case 'set_story_points':
      return { storyPoints: 3 }
    case 'create_subtasks':
      return { titles: [] }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------

function describeValue(condition: AutomationCondition, project: ProjectDetail) {
  const field = CONDITION_FIELD_OPTIONS.find((option) => option.value === condition.field)
  const values = Array.isArray(condition.value) ? condition.value : [condition.value]
  const name = (value: unknown) => {
    const id = String(value)
    switch (field?.kind) {
      case 'status':
        return project.statuses.find((status) => status.id === id)?.name ?? 'a status'
      case 'category':
        return STATUS_CATEGORY_META[id as StatusCategory]?.label ?? id
      case 'type':
        return ISSUE_TYPE_META[id as IssueType]?.label ?? id
      case 'priority':
        return PRIORITY_META[id as IssuePriority]?.label ?? id
      case 'member':
        return project.members.find((member) => member.id === id)?.name ?? 'someone'
      case 'label':
        return project.labels.find((label) => label.id === id)?.name ?? 'a label'
      default:
        return `“${id}”`
    }
  }
  return values.map(name).join(', ')
}

export function describeCondition(condition: AutomationCondition, project: ProjectDetail) {
  const field = CONDITION_FIELD_OPTIONS.find((option) => option.value === condition.field)?.label.toLowerCase() ?? condition.field
  const operator = OPERATOR_LABELS[condition.operator]
  return VALUELESS_OPERATORS.includes(condition.operator) ? `${field} ${operator}` : `${field} ${operator} ${describeValue(condition, project)}`
}

export function describeAction(action: AutomationAction, project: ProjectDetail) {
  const params = action.params as Record<string, unknown>
  switch (action.type) {
    case 'set_status':
      return `move to ${project.statuses.find((status) => status.id === params.statusId)?.name ?? 'a status'}`
    case 'set_priority':
      return `set priority to ${PRIORITY_META[params.priority as IssuePriority]?.label ?? params.priority}`
    case 'assign': {
      if (params.strategy === 'user') return `assign to ${project.members.find((member) => member.id === params.userId)?.name ?? 'someone'}`
      return `assign to ${ASSIGN_STRATEGY_OPTIONS.find((option) => option.value === params.strategy)?.label.toLowerCase()}`
    }
    case 'add_labels':
    case 'remove_labels': {
      const names = ((params.labelIds as string[]) ?? []).map((id) => project.labels.find((label) => label.id === id)?.name).filter(Boolean)
      return `${action.type === 'add_labels' ? 'add' : 'remove'} label${names.length === 1 ? '' : 's'} ${names.join(', ')}`
    }
    case 'add_comment':
      return 'add a comment'
    case 'notify':
      return `notify ${((params.recipients as string[]) ?? []).map((item) => item.replace('_', ' ')).join(', ') || 'selected people'}`
    case 'send_email':
      return `email ${((params.recipients as string[]) ?? []).map((item) => item.replace('_', ' ')).join(', ') || 'selected people'}`
    case 'set_due_date':
      return `set due date to ${params.daysFromNow} day(s) from now`
    case 'set_story_points':
      return `set story points to ${params.storyPoints}`
    case 'move_to_active_sprint':
      return 'move it into the active sprint'
    case 'create_subtasks':
      return `create ${((params.titles as string[]) ?? []).length} sub-task(s)`
    default:
      return action.type
  }
}

export function describeRule(rule: Pick<RuleInput, 'trigger' | 'conditions' | 'actions'>, project: ProjectDetail) {
  const when = TRIGGER_OPTIONS.find((option) => option.value === rule.trigger)?.sentence ?? rule.trigger
  const conditions = rule.conditions.map((condition) => describeCondition(condition, project))
  const actions = rule.actions.map((action) => describeAction(action, project))
  return `${when}${conditions.length ? `, if ${conditions.join(' and ')}` : ''}, then ${actions.join(', then ') || '…'}.`
}

// ---------------------------------------------------------------------------
// Recipes: one-click rules for common manual chores
// ---------------------------------------------------------------------------

export interface AutomationRecipe {
  id: string
  name: string
  description: string
  icon: Component
  build: (project: ProjectDetail) => RuleInput
}

const firstStatus = (project: ProjectDetail, category: StatusCategory) =>
  project.statuses.find((status) => status.category === category)?.id ?? project.statuses[0]?.id ?? ''

const reviewStatus = (project: ProjectDetail) =>
  project.statuses.find((status) => /review|qa|test/i.test(status.name))?.id ??
  project.statuses.filter((status) => status.category === 'in_progress').at(-1)?.id ??
  firstStatus(project, 'in_progress')

export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  {
    id: 'triage-bugs',
    name: 'Triage urgent bugs',
    description: 'High-priority bugs jump into the active sprint, get an owner and alert admins.',
    icon: Bug,
    build: () => ({
      name: 'Triage urgent bugs',
      trigger: 'issue.created',
      enabled: true,
      conditions: [
        { field: 'type', operator: 'equals', value: 'bug' },
        { field: 'priority', operator: 'in', value: ['high', 'highest'] },
      ],
      actions: [
        { type: 'move_to_active_sprint', params: {} },
        { type: 'assign', params: { strategy: 'least_loaded' } },
        { type: 'notify', params: { recipients: ['project_admins'], userIds: [], message: 'Urgent bug {{issue.key}} was triaged automatically.' } },
      ],
    }),
  },
  {
    id: 'start-on-assign',
    name: 'Start work when assigned',
    description: 'Moving cards to “In progress” by hand is no longer needed.',
    icon: PlayCircle,
    build: (project) => ({
      name: 'Start work when assigned',
      trigger: 'issue.assigned',
      enabled: true,
      conditions: [
        { field: 'statusCategory', operator: 'equals', value: 'todo' },
        { field: 'assigneeId', operator: 'is_not_empty' },
      ],
      actions: [{ type: 'set_status', params: { statusId: firstStatus(project, 'in_progress') } }],
    }),
  },
  {
    id: 'notify-reporter-done',
    name: 'Tell the reporter when it’s done',
    description: 'Close the loop with whoever asked for the work.',
    icon: CircleCheck,
    build: () => ({
      name: 'Tell the reporter when it’s done',
      trigger: 'issue.status_changed',
      enabled: true,
      conditions: [{ field: 'statusCategory', operator: 'equals', value: 'done' }],
      actions: [
        { type: 'notify', params: { recipients: ['reporter'], userIds: [], message: '{{issue.key}} “{{issue.title}}” is done.' } },
        { type: 'send_email', params: { recipients: ['reporter'], userIds: [], subject: '{{issue.key}} is done', message: '{{actor.name}} finished “{{issue.title}}”.' } },
      ],
    }),
  },
  {
    id: 'deadline-reminder',
    name: 'Remind before the deadline',
    description: 'Email and notify the assignee when a due date is close.',
    icon: AlarmClock,
    build: () => ({
      name: 'Remind before the deadline',
      trigger: 'issue.due_soon',
      enabled: true,
      conditions: [],
      actions: [
        { type: 'notify', params: { recipients: ['assignee'], userIds: [], message: '{{issue.key}} is due soon.' } },
        { type: 'send_email', params: { recipients: ['assignee'], userIds: [], subject: 'Reminder: {{issue.key}} is due soon', message: '“{{issue.title}}” is due soon. Current status: {{issue.status}}.' } },
      ],
    }),
  },
  {
    id: 'request-review',
    name: 'Ask watchers to review',
    description: 'When work reaches review, leave a note and ping everyone watching.',
    icon: MessageSquareReply,
    build: (project) => ({
      name: 'Ask watchers to review',
      trigger: 'issue.status_changed',
      enabled: true,
      conditions: [{ field: 'statusId', operator: 'equals', value: reviewStatus(project) }],
      actions: [
        { type: 'add_comment', params: { body: '{{actor.name}} moved this to review. Please take a look.' } },
        { type: 'notify', params: { recipients: ['watchers'], userIds: [], message: '{{issue.key}} is ready for review.' } },
      ],
    }),
  },
  {
    id: 'story-checklist',
    name: 'Definition of done for stories',
    description: 'Every new story gets the same checklist of sub-tasks.',
    icon: ListChecks,
    build: () => ({
      name: 'Definition of done for stories',
      trigger: 'issue.created',
      enabled: true,
      conditions: [{ field: 'type', operator: 'equals', value: 'story' }],
      actions: [{ type: 'create_subtasks', params: { titles: ['Write automated tests', 'Update documentation', 'QA sign-off'] } }],
    }),
  },
  {
    id: 'escalate-highest',
    name: 'Escalate highest priority',
    description: 'Raise to “Highest”: admins are notified and a 1-day due date is set.',
    icon: Flame,
    build: () => ({
      name: 'Escalate highest priority',
      trigger: 'issue.priority_changed',
      enabled: true,
      conditions: [{ field: 'priority', operator: 'equals', value: 'highest' }],
      actions: [
        { type: 'set_due_date', params: { daysFromNow: 1 } },
        { type: 'notify', params: { recipients: ['project_admins'], userIds: [], message: '{{issue.key}} was escalated to highest priority.' } },
      ],
    }),
  },
  {
    id: 'unassigned-to-lead',
    name: 'Unowned work goes to the lead',
    description: 'Nothing sits unassigned — the project lead triages it.',
    icon: UserCheck,
    build: () => ({
      name: 'Unowned work goes to the lead',
      trigger: 'issue.created',
      enabled: true,
      conditions: [{ field: 'assigneeId', operator: 'is_empty' }],
      actions: [{ type: 'assign', params: { strategy: 'project_lead' } }],
    }),
  },
  {
    id: 'reopen-on-comment',
    name: 'Reopen when commented after done',
    description: 'New feedback on finished work brings it back to the team.',
    icon: Users,
    build: (project) => ({
      name: 'Reopen when commented after done',
      trigger: 'comment.created',
      enabled: true,
      conditions: [{ field: 'statusCategory', operator: 'equals', value: 'done' }],
      actions: [{ type: 'set_status', params: { statusId: firstStatus(project, 'todo') } }],
    }),
  },
]
