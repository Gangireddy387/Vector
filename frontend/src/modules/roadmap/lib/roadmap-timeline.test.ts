import { describe, expect, it } from 'vitest'
import type { Issue } from '@/types/models'
import { barForIssue, buildRoadmapRows } from './roadmap-timeline'

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
})
