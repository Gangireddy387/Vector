import { describe, expect, it } from 'vitest'
import type { Issue } from '@/types/models'
import { boardCardHint } from './board-card-hint'

function issue(partial: Partial<Issue> & Pick<Issue, 'id' | 'key' | 'title'>): Issue {
  return {
    projectId: 'p1',
    number: 1,
    description: null,
    type: 'task',
    priority: 'medium',
    statusId: 's1',
    status: { id: 's1', name: 'To Do', category: 'todo', color: '#64748b' },
    assigneeId: 'u1',
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

describe('boardCardHint', () => {
  it('returns null for done work', () => {
    expect(
      boardCardHint(
        issue({
          id: '1',
          key: 'A-1',
          title: 'Done',
          status: { id: 's2', name: 'Done', category: 'done', color: '#22c55e' },
        }),
      ),
    ).toBeNull()
  })

  it('prioritizes overdue and unassigned', () => {
    expect(
      boardCardHint(
        issue({
          id: '1',
          key: 'A-1',
          title: 'Late',
          dueDate: '2020-01-01',
        }),
      )?.kind,
    ).toBe('schedule')
    expect(
      boardCardHint(
        issue({
          id: '2',
          key: 'A-2',
          title: 'Orphan',
          assigneeId: null,
          assignee: null,
        }),
      )?.kind,
    ).toBe('assign')
  })
})
