import { describe, expect, it } from 'vitest'
import type { Issue } from '@/types/models'
import { bucketOf, groupMyWork } from './my-work'

const issue = (partial: Partial<Issue> & Pick<Issue, 'id' | 'dueDate'> & { category?: 'todo' | 'in_progress' | 'done' }): Issue =>
  ({
    key: 'VEC-1',
    title: 'Task',
    type: 'task',
    priority: 'medium',
    statusId: 's1',
    status: { id: 's1', name: 'Todo', category: partial.category ?? 'todo', color: '#64748b' },
    projectId: 'p1',
    ...partial,
  }) as Issue

describe('bucketOf', () => {
  it('buckets by due date and done status', () => {
    expect(bucketOf(issue({ id: '1', dueDate: '2020-01-01' }), '2026-11-17', '2026-11-24')).toBe('overdue')
    expect(bucketOf(issue({ id: '2', dueDate: '2026-11-17' }), '2026-11-17', '2026-11-24')).toBe('today')
    expect(bucketOf(issue({ id: '3', dueDate: '2026-11-20' }), '2026-11-17', '2026-11-24')).toBe('week')
    expect(bucketOf(issue({ id: '4', dueDate: '2026-12-01' }), '2026-11-17', '2026-11-24')).toBe('later')
    expect(bucketOf(issue({ id: '5', dueDate: null }), '2026-11-17', '2026-11-24')).toBe('anytime')
    expect(bucketOf(issue({ id: '6', dueDate: '2026-11-17', category: 'done' }), '2026-11-17', '2026-11-24')).toBe('done')
  })
})

describe('groupMyWork', () => {
  it('orders buckets and prefers in-progress inside a bucket', () => {
    const groups = groupMyWork([
      issue({ id: 'a', dueDate: '2026-11-17', category: 'todo' }),
      issue({ id: 'b', dueDate: '2026-11-17', category: 'in_progress' }),
      issue({ id: 'c', dueDate: '2020-01-01' }),
    ])
    expect(groups.map((group) => group.bucket)).toEqual(['overdue', 'today'])
    expect(groups.find((group) => group.bucket === 'today')?.issues.map((row) => row.id)).toEqual(['b', 'a'])
  })
})
