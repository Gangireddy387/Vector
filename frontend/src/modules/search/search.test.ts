import { beforeEach, describe, expect, it } from 'vitest'
import { criteriaEqual, matchFieldLabel, sanitizeCriteria, summarizeCriteria } from '@/modules/issues/lib/saved-filter-criteria'
import { highlightParts } from './highlight-query'
import { clearRecentSearches, readRecentSearches, rememberSearch } from './search-recent'

describe('saved filter criteria', () => {
  it('summarizes known filters into short chips', () => {
    expect(
      summarizeCriteria({
        q: 'login',
        assigneeId: 'me',
        type: 'bug',
        priority: 'high',
        statusCategory: 'in_progress',
        overdue: 'true',
      }),
    ).toEqual(['“login”', 'Assigned to me', 'In progress', 'Bug', 'High', 'Overdue'])
  })

  it('compares criteria without empty noise', () => {
    expect(criteriaEqual({ type: 'bug', q: '' }, { type: 'bug' })).toBe(true)
    expect(criteriaEqual({ type: 'bug' }, { type: 'task' })).toBe(false)
  })

  it('keeps only issue-list keys', () => {
    expect(sanitizeCriteria({ type: 'bug', hack: 'nope', assigneeId: 'me' })).toEqual({ type: 'bug', assigneeId: 'me' })
  })

  it('labels search match fields', () => {
    expect(matchFieldLabel('description')).toBe('Description')
    expect(matchFieldLabel('comment')).toBe('Comment')
    expect(matchFieldLabel('unknown')).toBeUndefined()
  })
})

describe('highlightParts', () => {
  it('marks the longest query token case-insensitively', () => {
    expect(highlightParts('Fix login timeout', 'LOGIN')).toEqual([
      { text: 'Fix ', hit: false },
      { text: 'login', hit: true },
      { text: ' timeout', hit: false },
    ])
  })

  it('returns plain text when nothing matches', () => {
    expect(highlightParts('Board view', 'xyz')).toEqual([{ text: 'Board view', hit: false }])
  })
})

describe('recent searches', () => {
  beforeEach(() => {
    clearRecentSearches()
  })

  it('remembers newest first and dedupes case-insensitively', () => {
    rememberSearch('Login')
    rememberSearch('board')
    rememberSearch('login')
    expect(readRecentSearches()).toEqual(['login', 'board'])
  })

  it('clears stored history', () => {
    rememberSearch('alpha')
    clearRecentSearches()
    expect(readRecentSearches()).toEqual([])
  })
})
