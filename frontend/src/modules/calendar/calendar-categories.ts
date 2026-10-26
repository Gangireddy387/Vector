import { Brain, CalendarDays, ClipboardCheck, Coffee, Phone, Target, UserRoundSearch, Users } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { EventCategory } from './calendar.api'

export interface CategoryInfo {
  value: EventCategory
  label: string
  color: string
  icon: Component
}

export const EVENT_CATEGORIES: CategoryInfo[] = [
  { value: 'meeting', label: 'Meeting', color: '#3b82f6', icon: Users },
  { value: 'call', label: 'Call', color: '#06b6d4', icon: Phone },
  { value: 'review', label: 'Review', color: '#8b5cf6', icon: ClipboardCheck },
  { value: 'planning', label: 'Planning', color: '#f59e0b', icon: Target },
  { value: 'focus', label: 'Focus time', color: '#10b981', icon: Brain },
  { value: 'interview', label: 'Interview', color: '#ec4899', icon: UserRoundSearch },
  { value: 'personal', label: 'Personal', color: '#64748b', icon: Coffee },
  { value: 'other', label: 'Other', color: '#94a3b8', icon: CalendarDays },
]

export const categoryInfo = (value: EventCategory) => EVENT_CATEGORIES.find((category) => category.value === value) ?? EVENT_CATEGORIES.at(-1)!

export type CalendarView = 'day' | 'week' | 'month' | 'year'

/** Category colour as a left accent over a light wash of the same colour. */
export const eventTint = (category: EventCategory) => {
  const color = categoryInfo(category).color
  return { borderLeftColor: color, backgroundColor: `${color}1f` }
}

/** `09:30` → minutes after midnight. */
export const toMinutes = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export const durationMinutes = (event: { allDay: boolean; startTime: string | null; endTime: string | null }) =>
  !event.allDay && event.startTime && event.endTime ? toMinutes(event.endTime) - toMinutes(event.startTime) : 0

export const timeLabel = (event: { allDay: boolean; startTime: string | null; endTime: string | null }) =>
  event.allDay ? 'All day' : event.endTime ? `${event.startTime} – ${event.endTime}` : (event.startTime ?? '')

export interface Clock {
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:mm` */
  time: string
}

/** Today and the current time in the person's profile time zone, which is the zone the server checks against. */
export function clockIn(timeZone: string | null | undefined, at = new Date()): Clock {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    )
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
  } catch {
    return clockIn(undefined, at)
  }
}

export const isPastDay = (date: string, now: Clock) => date < now.date

export const hasStarted = (event: { date: string; allDay: boolean; startTime: string | null }, now: Clock) =>
  event.date < now.date || (event.date === now.date && (event.allDay || (event.startTime ?? '') <= now.time))

export function formatHours(minutes: number) {
  if (!minutes) return '0h'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
