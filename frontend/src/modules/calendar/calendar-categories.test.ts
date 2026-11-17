import { describe, expect, it } from 'vitest'
import { durationMinutes, formatHours, hasStarted, isPastDay, toMinutes } from './calendar-categories'

describe('calendar time helpers', () => {
  it('converts HH:mm to minutes after midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('09:30')).toBe(9 * 60 + 30)
    expect(toMinutes('23:45')).toBe(23 * 60 + 45)
  })

  it('measures timed event duration and treats all-day as zero', () => {
    expect(durationMinutes({ allDay: false, startTime: '09:00', endTime: '10:30' })).toBe(90)
    expect(durationMinutes({ allDay: true, startTime: null, endTime: null })).toBe(0)
  })

  it('formats hour labels', () => {
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(60)).toBe('1h')
    expect(formatHours(90)).toBe('1h 30m')
  })

  it('knows past days and whether an event has started', () => {
    const now = { date: '2026-03-15', time: '12:00' }
    expect(isPastDay('2026-03-14', now)).toBe(true)
    expect(isPastDay('2026-03-15', now)).toBe(false)
    expect(hasStarted({ date: '2026-03-15', allDay: false, startTime: '11:00' }, now)).toBe(true)
    expect(hasStarted({ date: '2026-03-15', allDay: false, startTime: '13:00' }, now)).toBe(false)
    expect(hasStarted({ date: '2026-03-15', allDay: true, startTime: null }, now)).toBe(true)
  })
})
