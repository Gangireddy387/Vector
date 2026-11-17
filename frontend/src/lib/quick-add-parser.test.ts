import { describe, expect, it } from 'vitest'
import { parseDueDate, parseQuickAdd } from './quick-add-parser'

describe('parseDueDate', () => {
  const today = new Date('2026-11-17T12:00:00Z')

  it('parses relative and absolute dates', () => {
    expect(parseDueDate('today', today)).toBe('2026-11-17')
    expect(parseDueDate('tomorrow', today)).toBe('2026-11-18')
    expect(parseDueDate('+3d', today)).toBe('2026-11-20')
    expect(parseDueDate('2026-12-01', today)).toBe('2026-12-01')
    expect(parseDueDate('nope', today)).toBeNull()
  })
})

describe('parseQuickAdd', () => {
  it('extracts assignee, priority, type, points and due date', () => {
    const members = [{ id: 'u1', name: 'Ada Lovelace', email: 'ada@example.test', avatarColor: '#000', status: 'active' as const }]
    const labels = [{ id: 'l1', name: 'backend', color: '#3b82f6', projectId: 'p1' }]
    const result = parseQuickAdd('Fix login @ada #backend !high ^tomorrow ~3 /bug', {
      members,
      labels,
      currentUserId: 'me',
    })
    expect(result.title).toContain('Fix login')
    expect(result.assigneeId).toBe('u1')
    expect(result.labelIds).toContain('l1')
    expect(result.priority).toBe('high')
    expect(result.type).toBe('bug')
    expect(result.storyPoints).toBe(3)
    expect(result.dueDate).toBeTruthy()
  })
})
