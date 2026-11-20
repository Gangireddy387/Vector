import { describe, expect, it } from 'vitest'
import { buildDependencyLines, cycleEdgeKeys } from './roadmap-dependency-lines'

describe('cycleEdgeKeys', () => {
  it('indexes consecutive pairs including wrap-around', () => {
    const keys = cycleEdgeKeys([
      ['a', 'b', 'c'],
      ['x', 'y'],
    ])
    expect(keys.has('a->b')).toBe(true)
    expect(keys.has('b->c')).toBe(true)
    expect(keys.has('c->a')).toBe(true)
    expect(keys.has('x->y')).toBe(true)
    expect(keys.has('y->x')).toBe(true)
    expect(keys.has('a->c')).toBe(false)
  })
})

describe('buildDependencyLines', () => {
  const bars = new Map([
    ['blocker', { left: 0, width: 80, rowIndex: 0 }],
    ['blocked', { left: 160, width: 60, rowIndex: 2 }],
    ['same-row-a', { left: 0, width: 40, rowIndex: 1 }],
    ['same-row-b', { left: 100, width: 40, rowIndex: 1 }],
  ])

  it('draws FS connectors when both ends have bars', () => {
    const lines = buildDependencyLines({
      edges: [{ id: 'e1', from: 'blocker', to: 'blocked' }],
      bars,
      rowHeight: 40,
      criticalIds: ['blocker', 'blocked'],
      issueKeys: new Map([
        ['blocker', 'VEC-1'],
        ['blocked', 'VEC-2'],
      ]),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].fromKey).toBe('VEC-1')
    expect(lines[0].toKey).toBe('VEC-2')
    expect(lines[0].critical).toBe(true)
    expect(lines[0].cycle).toBe(false)
    expect(lines[0].d.startsWith('M 80 20')).toBe(true)
    expect(lines[0].d.includes('160')).toBe(true)
  })

  it('skips edges missing a visible bar', () => {
    const lines = buildDependencyLines({
      edges: [
        { id: 'e1', from: 'blocker', to: 'missing' },
        { id: 'e2', from: 'ghost', to: 'blocked' },
      ],
      bars,
      rowHeight: 40,
    })
    expect(lines).toHaveLength(0)
  })

  it('marks cycle edges and leaves non-critical unmarked', () => {
    const lines = buildDependencyLines({
      edges: [{ id: 'e1', from: 'same-row-a', to: 'same-row-b' }],
      bars,
      rowHeight: 40,
      cycleKeys: cycleEdgeKeys([['same-row-a', 'same-row-b']]),
      criticalIds: ['same-row-a'],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].cycle).toBe(true)
    expect(lines[0].critical).toBe(false)
  })
})
