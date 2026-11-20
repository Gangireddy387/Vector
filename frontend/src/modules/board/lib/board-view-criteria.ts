import type { BoardFilterState, BoardQuickFilter } from '../components/BoardFilters.vue'
import type { BoardDensity, BoardGroupBy } from '../composables/useBoardView'

export type BoardViewCriteria = Record<string, string>

const QUICK: BoardQuickFilter[] = ['mine', 'dueSoon', 'overdue', 'recent']
const GROUPS: BoardGroupBy[] = ['none', 'assignee', 'priority', 'type', 'epic']
const DENSITIES: BoardDensity[] = ['comfortable', 'compact']

const ALLOWED = new Set(['search', 'assigneeIds', 'types', 'priorities', 'labelIds', 'quick', 'groupBy', 'density'])

/** Snapshot board filters + display into saveable criteria. */
export function boardStateToCriteria(
  filters: BoardFilterState,
  display: { groupBy: BoardGroupBy; density: BoardDensity },
): BoardViewCriteria {
  const criteria: BoardViewCriteria = {}
  if (filters.search?.trim()) criteria.search = filters.search.trim()
  if (filters.assigneeIds?.length) criteria.assigneeIds = filters.assigneeIds.join(',')
  if (filters.types) criteria.types = filters.types
  if (filters.priorities) criteria.priorities = filters.priorities
  if (filters.labelIds) criteria.labelIds = filters.labelIds
  if (filters.quick?.length) criteria.quick = filters.quick.join(',')
  if (display.groupBy && display.groupBy !== 'none') criteria.groupBy = display.groupBy
  if (display.density && display.density !== 'comfortable') criteria.density = display.density
  return criteria
}

export function sanitizeBoardCriteria(criteria: Record<string, unknown>): BoardViewCriteria {
  return Object.fromEntries(
    Object.entries(criteria)
      .filter(([key, value]) => ALLOWED.has(key) && value != null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}

export function criteriaToBoardFilters(criteria: BoardViewCriteria): BoardFilterState {
  const quick = (criteria.quick ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is BoardQuickFilter => QUICK.includes(part as BoardQuickFilter))
  return {
    search: criteria.search ?? '',
    assigneeIds: (criteria.assigneeIds ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
    types: criteria.types || undefined,
    priorities: criteria.priorities || undefined,
    labelIds: criteria.labelIds || undefined,
    quick: quick.length ? quick : undefined,
  }
}

export function criteriaToBoardDisplay(criteria: BoardViewCriteria): {
  groupBy?: BoardGroupBy
  density?: BoardDensity
} {
  const groupBy = GROUPS.includes(criteria.groupBy as BoardGroupBy) ? (criteria.groupBy as BoardGroupBy) : undefined
  const density = DENSITIES.includes(criteria.density as BoardDensity)
    ? (criteria.density as BoardDensity)
    : undefined
  return { groupBy, density }
}

export function summarizeBoardCriteria(criteria: BoardViewCriteria): string[] {
  const chips: string[] = []
  if (criteria.search) chips.push(`“${criteria.search}”`)
  if (criteria.assigneeIds) {
    const count = criteria.assigneeIds.split(',').filter(Boolean).length
    chips.push(count === 1 ? '1 assignee' : `${count} assignees`)
  }
  if (criteria.types) chips.push('Type')
  if (criteria.priorities) chips.push('Priority')
  if (criteria.labelIds) chips.push('Label')
  if (criteria.quick) {
    for (const part of criteria.quick.split(',')) {
      if (part === 'mine') chips.push('My tasks')
      else if (part === 'dueSoon') chips.push('Due this week')
      else if (part === 'overdue') chips.push('Overdue')
      else if (part === 'recent') chips.push('Updated today')
    }
  }
  if (criteria.groupBy && criteria.groupBy !== 'none') {
    chips.push(`Group: ${criteria.groupBy}`)
  }
  if (criteria.density === 'compact') chips.push('Compact')
  return chips
}

export function boardCriteriaEqual(a: BoardViewCriteria, b: BoardViewCriteria): boolean {
  const left = sanitizeBoardCriteria(a)
  const right = sanitizeBoardCriteria(b)
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if ((left[key] ?? '') !== (right[key] ?? '')) return false
  }
  return true
}
