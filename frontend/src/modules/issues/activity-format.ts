import type { Activity } from '@/types/models'

const FIELD_NAMES: Record<string, string> = {
  status: 'status',
  assignee: 'assignee',
  priority: 'priority',
  type: 'type',
  title: 'title',
  description: 'description',
  storyPoints: 'story points',
  estimateMinutes: 'estimate',
  dueDate: 'due date',
  startDate: 'start date',
  sprint: 'sprint',
  parent: 'parent',
  labels: 'labels',
}

/** Returns who did it and a readable sentence for an audit-trail entry. */
export function describeActivity(activity: Activity) {
  const source = activity.meta?.source
  const isAutomated = source === 'automation' || source === 'system' || source === 'recurring' || !activity.actor
  const actorName =
    activity.actor?.name ??
    (source === 'automation' || activity.action === 'automation_ran' ? 'Automation' : source === 'recurring' ? 'Recurring task' : 'Vector')

  const field = activity.field ? FIELD_NAMES[activity.field] ?? activity.field : ''
  const from = activity.fromValue
  const to = activity.toValue

  let text: string
  switch (activity.action) {
    case 'created':
      text = source === 'recurring' ? 'created this from a recurring schedule' : 'created the issue'
      break
    case 'updated':
      if (field === 'description') text = 'updated the description'
      else if (!from && to) text = `set ${field} to ${to}`
      else if (from && !to) text = `cleared ${field} (was ${from})`
      else text = `changed ${field} from ${from} to ${to}`
      break
    case 'auto_assigned':
      text = `auto-assigned to ${to}`
      break
    case 'commented':
      text = 'commented'
      break
    case 'attached':
      text = `attached ${to}`
      break
    case 'logged_work':
      text = `logged ${to} of work`
      break
    case 'linked':
      text = `linked: ${to}`
      break
    case 'automation_ran':
      text = `rule “${to}” ran`
      break
    case 'deleted':
      text = `deleted ${to}`
      break
    case 'sprint_started':
      text = `started ${to}`
      break
    case 'sprint_completed':
      text = `completed ${to}`
      break
    case 'member_added':
      text = `added ${to} to the project`
      break
    case 'project_created':
      text = `created the project ${to}`
      break
    default:
      text = activity.action.replace(/_/g, ' ')
  }

  const reason = activity.meta?.ruleName ? `via rule “${activity.meta.ruleName}”` : activity.meta?.reason ?? null
  return { actorName, text, reason, isAutomated }
}
