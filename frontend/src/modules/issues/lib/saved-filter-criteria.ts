import { ISSUE_TYPE_META, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import type { IssuePriority, IssueType, StatusCategory } from '@/types/models'

export type SavedCriteria = Record<string, string | number | boolean | null | undefined>

const MATCH_LABELS: Record<string, string> = {
  key: 'Key',
  title: 'Title',
  description: 'Description',
  comment: 'Comment',
  label: 'Label',
}

/** Short chips for a saved view (and search match hints). */
export function summarizeCriteria(criteria: SavedCriteria): string[] {
  const chips: string[] = []
  if (criteria.q) chips.push(`“${criteria.q}”`)
  if (criteria.assigneeId === 'me') chips.push('Assigned to me')
  else if (criteria.assigneeId === 'unassigned') chips.push('Unassigned')
  else if (criteria.assigneeId) chips.push('Assignee')
  if (typeof criteria.statusCategory === 'string' && criteria.statusCategory in STATUS_CATEGORY_META) {
    chips.push(STATUS_CATEGORY_META[criteria.statusCategory as StatusCategory].label)
  } else if (criteria.statusCategory) chips.push(String(criteria.statusCategory))
  if (typeof criteria.type === 'string' && criteria.type in ISSUE_TYPE_META) {
    chips.push(ISSUE_TYPE_META[criteria.type as IssueType].label)
  } else if (criteria.type) chips.push(String(criteria.type))
  if (typeof criteria.priority === 'string' && criteria.priority in PRIORITY_META) {
    chips.push(PRIORITY_META[criteria.priority as IssuePriority].label)
  } else if (criteria.priority) chips.push(String(criteria.priority))
  if (criteria.labelId) chips.push('Label')
  if (criteria.componentId === 'none') chips.push('No component')
  else if (criteria.componentId) chips.push('Component')
  if (criteria.sprintId === 'active') chips.push('Active sprint')
  else if (criteria.sprintId === 'backlog') chips.push('Backlog')
  else if (criteria.sprintId) chips.push('Sprint')
  if (criteria.parentId === 'none') chips.push('No epic')
  else if (criteria.parentId) chips.push('Epic')
  if (criteria.overdue === 'true' || criteria.overdue === true) chips.push('Overdue')
  if (criteria.customFieldId) chips.push('Custom field')
  if (criteria.sort === 'dueDate') chips.push('Sort: due date')
  else if (criteria.sort === 'priority') chips.push('Sort: priority')
  else if (criteria.sort === 'updatedAt') chips.push('Sort: updated')
  else if (criteria.sort === 'createdAt') chips.push('Sort: newest')
  else if (criteria.sort === 'key') chips.push('Sort: key')
  return chips
}

export function criteriaEqual(a: SavedCriteria, b: SavedCriteria): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const left = a[key] == null || a[key] === '' ? undefined : String(a[key])
    const right = b[key] == null || b[key] === '' ? undefined : String(b[key])
    if (left !== right) return false
  }
  return true
}

export function matchFieldLabel(field?: string): string | undefined {
  if (!field) return undefined
  return MATCH_LABELS[field]
}

/** Keep only keys the issue list actually understands. */
export function sanitizeCriteria(criteria: SavedCriteria): Record<string, string> {
  const allowed = new Set([
    'q',
    'assigneeId',
    'reporterId',
    'statusId',
    'statusCategory',
    'type',
    'priority',
    'labelId',
    'componentId',
    'sprintId',
    'parentId',
    'customFieldId',
    'customFieldOp',
    'customFieldValue',
    'dueFrom',
    'dueTo',
    'overdue',
    'sort',
    'order',
  ])
  return Object.fromEntries(
    Object.entries(criteria)
      .filter(([key, value]) => allowed.has(key) && value != null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}
