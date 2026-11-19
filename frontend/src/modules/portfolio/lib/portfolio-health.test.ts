import { describe, expect, it } from 'vitest'
import type { Project } from '@/types/models'
import { completionOf, healthOf } from './portfolio-health'

function project(partial: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    key: 'P',
    color: '#3b82f6',
    description: null,
    type: 'kanban',
    leadId: null,
    lead: null,
    settings: {} as Project['settings'],
    archivedAt: null,
    myRole: 'member',
    createdAt: '',
    organizationId: null,
    ...partial,
  } as Project
}

describe('portfolio health', () => {
  it('marks empty projects', () => {
    expect(healthOf(project({ id: '1', name: 'A', issueSummary: { total: 0, open: 0, done: 0, overdue: 0 } }))).toBe('empty')
  })

  it('marks complete projects', () => {
    expect(healthOf(project({ id: '1', name: 'A', issueSummary: { total: 4, open: 0, done: 4, overdue: 0 } }))).toBe('done')
  })

  it('marks overdue ahead of at-risk', () => {
    expect(healthOf(project({ id: '1', name: 'A', issueSummary: { total: 4, open: 2, done: 2, overdue: 1 } }))).toBe('overdue')
  })

  it('computes completion', () => {
    expect(completionOf(project({ id: '1', name: 'A', issueSummary: { total: 4, open: 1, done: 3 } }))).toBe(75)
  })
})
