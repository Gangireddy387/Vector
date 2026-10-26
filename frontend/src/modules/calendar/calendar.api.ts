import { http } from '@/lib/http'

export type EventCategory = 'meeting' | 'call' | 'review' | 'planning' | 'focus' | 'interview' | 'personal' | 'other'
export type EventStatus = 'planned' | 'done' | 'cancelled'
export type RepeatFrequency = 'daily' | 'weekdays' | 'weekly'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  /** Local `YYYY-MM-DD`. */
  date: string
  allDay: boolean
  /** Local `HH:mm`; null for all-day events. */
  startTime: string | null
  endTime: string | null
  category: EventCategory
  location: string | null
  projectId: string | null
  project: { id: string; name: string; key: string; color: string } | null
  status: EventStatus
  completedAt: string | null
  seriesId: string | null
  createdAt: string
  updatedAt: string
}

export interface EventInput {
  title: string
  description: string | null
  date: string
  allDay: boolean
  startTime: string | null
  endTime: string | null
  category: EventCategory
  location: string | null
  projectId: string | null
}

export const calendarApi = {
  list: (from: string, to: string) =>
    http.get<{ events: CalendarEvent[] }>('/calendar/events', { params: { from, to } }).then((r) => r.data.events),
  /** Repeating events come back as one event per day. */
  create: (input: EventInput & { repeat: { frequency: RepeatFrequency; until: string } | null }) =>
    http.post<{ events: CalendarEvent[] }>('/calendar/events', input).then((r) => r.data.events),
  update: (eventId: string, changes: Partial<EventInput> & { status?: EventStatus }) =>
    http.patch<{ event: CalendarEvent }>(`/calendar/events/${eventId}`, changes).then((r) => r.data.event),
  remove: (eventId: string, scope: 'one' | 'following' = 'one') =>
    http.delete<{ removedIds: string[] }>(`/calendar/events/${eventId}`, { params: { scope } }).then((r) => r.data.removedIds),
}
