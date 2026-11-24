import { describe, expect, it } from 'vitest'
import type { Issue } from '@/types/models'
import {
  barForIssue,
  buildRoadmapRows,
  dayDeltaFromPixels,
  monthBands,
  placementDates,
  resizeIssueDates,
  shiftIssueDates,
  weekendOffsets,
} from './roadmap-timeline'
import { parseISO, startOfDay } from 'date-fns'

function issue(partial: Partial<Issue> & Pick<Issue, 'id' | 'key' | 'title' | 'type'>): Issue {
  return {
    projectId: 'p1',
    number: 1,
    description: null,
    priority: 'medium',
    statusId: 's1',
    status: { id: 's1', name: 'To Do', category: 'todo', color: '#64748b' },
    assigneeId: null,
    assignee: null,
    reporterId: null,
    parentId: null,
    parent: null,
    sprintId: null,
    sprint: null,
    project: { id: 'p1', key: 'A', name: 'Proj', color: '#3b82f6' },
    labels: [],
    storyPoints: null,
    estimateMinutes: null,
    startDate: null,
    dueDate: null,
    position: 1,
    completedAt: null,
    createdAt: '',
    updatedAt: '',
    subtaskProgress: { total: 0, done: 0 },
    commentCount: 0,
    attachmentCount: 0,
    ...partial,
  }
}

describe('roadmap timeline', () => {
  it('builds a point bar from due date only', () => {
    const bar = barForIssue(issue({ id: '1', key: 'A-1', title: 'Task', type: 'task', dueDate: '2026-11-20' }))
    expect(bar?.point).toBe(true)
    expect(bar?.derived).toBe(false)
  })

  it('derives epic bar from children', () => {
    const epic = issue({ id: 'e1', key: 'A-1', title: 'Epic', type: 'epic' })
    const child = issue({
      id: 'c1',
      key: 'A-2',
      title: 'Child',
      type: 'task',
      parentId: 'e1',
      startDate: '2026-11-01',
      dueDate: '2026-11-10',
    })
    const rows = buildRoadmapRows([epic, child])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.bar?.derived).toBe(true)
    expect(rows[0]?.children).toHaveLength(1)
  })

  it('hides done when requested', () => {
    const open = issue({ id: '1', key: 'A-1', title: 'Open', type: 'task', dueDate: '2026-11-20' })
    const done = issue({
      id: '2',
      key: 'A-2',
      title: 'Done',
      type: 'task',
      dueDate: '2026-11-21',
      status: { id: 's2', name: 'Done', category: 'done', color: '#22c55e' },
    })
    expect(buildRoadmapRows([open, done], { hideDone: true })).toHaveLength(1)
    expect(buildRoadmapRows([open, done], { hideDone: false })).toHaveLength(2)
  })

  it('shifts only the dates that exist', () => {
    expect(shiftIssueDates({ startDate: null, dueDate: '2026-11-20' }, 3)).toEqual({ dueDate: '2026-11-23' })
    expect(shiftIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-10' }, -2)).toEqual({
      startDate: '2026-10-30',
      dueDate: '2026-11-08',
    })
    expect(shiftIssueDates({ startDate: null, dueDate: null }, 1)).toBeNull()
    expect(shiftIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-10' }, 0)).toBeNull()
  })

  it('maps pixel drag to whole days', () => {
    expect(dayDeltaFromPixels(40, 28)).toBe(1)
    expect(dayDeltaFromPixels(-20, 28)).toBe(-1)
    expect(dayDeltaFromPixels(10, 28)).toBe(0)
  })

  it('resizes end and start independently', () => {
    expect(resizeIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-10' }, 'end', 3)).toEqual({
      startDate: '2026-11-01',
      dueDate: '2026-11-13',
    })
    expect(resizeIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-10' }, 'start', 2)).toEqual({
      startDate: '2026-11-03',
      dueDate: '2026-11-10',
    })
  })

  it('grows a point bar into a range and clamps invert', () => {
    expect(resizeIssueDates({ startDate: null, dueDate: '2026-11-20' }, 'end', 4)).toEqual({
      startDate: '2026-11-20',
      dueDate: '2026-11-24',
    })
    expect(resizeIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-05' }, 'start', 10)).toEqual({
      startDate: '2026-11-05',
      dueDate: '2026-11-05',
    })
    expect(resizeIssueDates({ startDate: '2026-11-01', dueDate: '2026-11-05' }, 'end', 0)).toBeNull()
  })

  it('places a span from a day index', () => {
    const start = startOfDay(parseISO('2026-11-01'))
    expect(placementDates(start, 0, 7)).toEqual({ startDate: '2026-11-01', dueDate: '2026-11-07' })
    expect(placementDates(start, 3, 1)).toEqual({ startDate: '2026-11-04', dueDate: '2026-11-04' })
  })

  it('builds month bands across the visible range', () => {
    const start = startOfDay(parseISO('2026-11-15'))
    const end = startOfDay(parseISO('2026-12-10'))
    const bands = monthBands(start, end)
    expect(bands).toHaveLength(2)
    expect(bands[0]?.label).toBe('Nov 2026')
    expect(bands[0]?.offset).toBe(0)
    expect(bands[1]?.label).toBe('Dec 2026')
  })

  it('lists weekend day offsets', () => {
    // 2026-11-01 is Sunday
    const start = startOfDay(parseISO('2026-11-01'))
    expect(weekendOffsets(start, 7)).toEqual([0, 6])
  })
})
