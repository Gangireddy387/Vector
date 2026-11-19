import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  isValid,
  max,
  min,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import type { Issue, Sprint } from '@/types/models'

export type RoadmapScale = 'week' | 'month'

export interface RoadmapBar {
  start: Date
  end: Date
  /** True when only a single date exists (drawn as a short marker). */
  point: boolean
  derived: boolean
}

export interface RoadmapRow {
  issue: Issue
  depth: number
  bar: RoadmapBar | null
  children: RoadmapRow[]
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const date = parseISO(value)
  return isValid(date) ? startOfDay(date) : null
}

export function barForIssue(issue: Issue, childBars: RoadmapBar[] = []): RoadmapBar | null {
  const start = parseDate(issue.startDate)
  const due = parseDate(issue.dueDate)
  if (start && due) {
    return { start: min([start, due]), end: max([start, due]), point: false, derived: false }
  }
  if (due) return { start: due, end: due, point: true, derived: false }
  if (start) return { start, end: start, point: true, derived: false }

  if (childBars.length) {
    return {
      start: min(childBars.map((bar) => bar.start)),
      end: max(childBars.map((bar) => bar.end)),
      point: false,
      derived: true,
    }
  }
  return null
}

export function buildRoadmapRows(issues: Issue[], options: { hideDone?: boolean; datedOnly?: boolean } = {}): RoadmapRow[] {
  const visible = issues.filter((issue) => {
    if (options.hideDone && issue.status?.category === 'done') return false
    return true
  })
  const byId = new Map(visible.map((issue) => [issue.id, issue]))
  const childrenOf = new Map<string, Issue[]>()
  const roots: Issue[] = []

  for (const issue of visible) {
    if (issue.parentId && byId.has(issue.parentId)) {
      const list = childrenOf.get(issue.parentId) ?? []
      list.push(issue)
      childrenOf.set(issue.parentId, list)
    } else {
      roots.push(issue)
    }
  }

  const sortIssues = (list: Issue[]) =>
    [...list].sort((a, b) => {
      const aDate = parseDate(a.startDate) ?? parseDate(a.dueDate)
      const bDate = parseDate(b.startDate) ?? parseDate(b.dueDate)
      if (aDate && bDate) return aDate.getTime() - bDate.getTime()
      if (aDate) return -1
      if (bDate) return 1
      return a.position - b.position
    })

  function build(issue: Issue, depth: number): RoadmapRow {
    const children = sortIssues(childrenOf.get(issue.id) ?? []).map((child) => build(child, depth + 1))
    const bar = barForIssue(
      issue,
      children.map((child) => child.bar).filter((item): item is RoadmapBar => Boolean(item)),
    )
    return { issue, depth, bar, children }
  }

  let rows = sortIssues(roots).map((issue) => build(issue, 0))
  if (options.datedOnly) {
    const keep = (row: RoadmapRow): RoadmapRow | null => {
      const kids = row.children.map(keep).filter((item): item is RoadmapRow => Boolean(item))
      if (!row.bar && !kids.length) return null
      return { ...row, children: kids }
    }
    rows = rows.map(keep).filter((item): item is RoadmapRow => Boolean(item))
  }
  return rows
}

export function flattenRows(rows: RoadmapRow[], expanded: Set<string>): RoadmapRow[] {
  const result: RoadmapRow[] = []
  for (const row of rows) {
    result.push(row)
    if (row.children.length && expanded.has(row.issue.id)) {
      result.push(...flattenRows(row.children, expanded))
    }
  }
  return result
}

export function computeRange(
  rows: RoadmapRow[],
  sprints: Sprint[] = [],
  today = startOfDay(new Date()),
): { start: Date; end: Date } {
  const dates: Date[] = [today, addMonths(today, 1)]
  const walk = (list: RoadmapRow[]) => {
    for (const row of list) {
      if (row.bar) {
        dates.push(row.bar.start, row.bar.end)
      }
      walk(row.children)
    }
  }
  walk(rows)
  for (const sprint of sprints) {
    const start = parseDate(sprint.startDate)
    const end = parseDate(sprint.endDate)
    if (start) dates.push(start)
    if (end) dates.push(end)
  }
  const start = startOfMonth(min(dates))
  const end = endOfMonth(max(dates))
  return { start, end: max([end, addMonths(start, 1)]) }
}

export function dayOffset(rangeStart: Date, date: Date) {
  return differenceInCalendarDays(date, rangeStart)
}

export function rangeDays(rangeStart: Date, rangeEnd: Date) {
  return Math.max(differenceInCalendarDays(rangeEnd, rangeStart) + 1, 1)
}

export function ticksForScale(rangeStart: Date, rangeEnd: Date, scale: RoadmapScale) {
  if (scale === 'month') {
    return eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).map((date) => ({
      date,
      label: format(date, 'MMM yyyy'),
      span: differenceInCalendarDays(endOfMonth(date), date) + 1,
    }))
  }
  return eachWeekOfInterval(
    { start: rangeStart, end: rangeEnd },
    { weekStartsOn: 1 },
  ).map((date) => {
    const weekEnd = min([addDays(date, 6), rangeEnd])
    return {
      date,
      label: format(date, 'd MMM'),
      span: differenceInCalendarDays(weekEnd, date) + 1,
    }
  })
}

export function todayLineLeft(rangeStart: Date, totalDays: number, dayWidth: number) {
  const offset = dayOffset(rangeStart, startOfDay(new Date()))
  if (offset < 0 || offset > totalDays) return null
  return offset * dayWidth
}

export function sprintBands(sprints: Sprint[], rangeStart: Date, totalDays: number, dayWidth: number) {
  return sprints
    .map((sprint) => {
      const start = parseDate(sprint.startDate)
      const end = parseDate(sprint.endDate)
      if (!start || !end) return null
      const left = Math.max(0, dayOffset(rangeStart, start)) * dayWidth
      const right = Math.min(totalDays, dayOffset(rangeStart, end) + 1) * dayWidth
      if (right <= left) return null
      return { sprint, left, width: right - left }
    })
    .filter(Boolean) as Array<{ sprint: Sprint; left: number; width: number }>
}

