import { describe, expect, it } from 'vitest'
import { attendanceCsv, attendanceDuration } from './attendance'
import { callShortcutFor, isTalkKey } from './call/shortcuts'
import type { AttendanceEntry } from './meetings.api'
import { boardBounds, noteFill, textLines } from './whiteboard'

const key = (code: string, modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
})

describe('call shortcuts', () => {
  it('uses Ctrl on Windows and ⌘ on a Mac', () => {
    expect(callShortcutFor(key('KeyD', { ctrlKey: true }), false)).toBe('mute')
    expect(callShortcutFor(key('KeyD', { metaKey: true }), true)).toBe('mute')
    expect(callShortcutFor(key('KeyD', { metaKey: true }), false)).toBeNull()
  })

  it('tells shortcuts on the same key apart by Shift and Alt', () => {
    expect(callShortcutFor(key('KeyE', { ctrlKey: true }), false)).toBe('camera')
    expect(callShortcutFor(key('KeyE', { ctrlKey: true, shiftKey: true }), false)).toBe('share')
    expect(callShortcutFor(key('KeyH', { ctrlKey: true, altKey: true }), false)).toBe('hand')
    expect(callShortcutFor(key('KeyH', { ctrlKey: true, shiftKey: true }), false)).toBe('leave')
  })

  it('ignores keys without the modifier (typing in the chat)', () => {
    expect(callShortcutFor(key('KeyD'), false)).toBeNull()
    expect(callShortcutFor(key('KeyX', { ctrlKey: true }), false)).toBeNull()
  })

  it('knows the hold-to-talk keys', () => {
    expect(isTalkKey(key('Space', { ctrlKey: !/Mac|iPhone|iPad/.test(navigator.platform), altKey: /Mac|iPhone|iPad/.test(navigator.platform) }))).toBe(true)
    expect(isTalkKey(key('Space'))).toBe(false)
  })
})

describe('attendance report', () => {
  const entry = (changes: Partial<AttendanceEntry>): AttendanceEntry => ({
    key: 'a',
    userId: 'a',
    name: 'Ann',
    email: 'ann@example.com',
    kind: 'member',
    firstJoinedAt: '2026-10-30T09:00:00.000Z',
    lastLeftAt: '2026-10-30T09:30:00.000Z',
    seconds: 1800,
    sessions: 1,
    inCall: false,
    ...changes,
  })

  it('says how long people stayed', () => {
    expect(attendanceDuration(42)).toBe('42 s')
    expect(attendanceDuration(1800)).toBe('30 min')
    expect(attendanceDuration(3900)).toBe('1 h 05 min')
  })

  it('exports CSV that spreadsheets read safely', () => {
    const csv = attendanceCsv([entry({}), entry({ key: 'b', name: '=HYPERLINK("http://evil")', email: null, kind: 'guest', inCall: true, lastLeftAt: null })])
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('"Name","Email","Type","First joined","Last left","Minutes in call","Times joined"')
    expect(lines[1]).toBe('"Ann","ann@example.com","Member","2026-10-30T09:00:00.000Z","2026-10-30T09:30:00.000Z","30","1"')
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(lines[2]).toContain('"Still in the call"')
  })
})

describe('whiteboard', () => {
  it('wraps text to the width, keeping line breaks', () => {
    const measure = (text: string) => text.length
    expect(textLines('one two three four', 9, measure)).toEqual(['one two', 'three', 'four'])
    expect(textLines('first\nsecond', 20, measure)).toEqual(['first', 'second'])
  })

  it('makes sticky notes a light version of the colour', () => {
    expect(noteFill('#111827')).toBe('#fef08a')
    expect(noteFill('#ff0000')).toBe('rgb(255, 179, 179)')
  })

  it('knows what a shape covers, for the eraser', () => {
    const rect = { id: 'r', owner: 'u', kind: 'rect' as const, color: '#000000', width: 3, tool: 'pen' as const, points: [0.4, 0.5, 0.1, 0.2] }
    expect(boardBounds(rect, 16 / 9, () => 0)).toEqual({ left: 0.1, top: 0.2, right: 0.4, bottom: 0.5 })
    const note = { ...rect, kind: 'note' as const, points: [0.2, 0.2], text: 'Hi' }
    const bounds = boardBounds(note, 2, () => 0)
    expect(bounds.right).toBeCloseTo(0.37)
    expect(bounds.bottom).toBeCloseTo(0.54)
  })
})
