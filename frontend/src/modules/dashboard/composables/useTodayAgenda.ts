import { isToday, parseISO } from 'date-fns'
import { onMounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { toDateInput } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import { calendarApi } from '@/modules/calendar/calendar.api'
import { meetingsApi } from '@/modules/meetings/meetings.api'

export interface AgendaItem {
  id: string
  kind: 'meeting' | 'event'
  title: string
  /** `HH:mm`, or null for all-day events. */
  start: string | null
  end: string | null
  live: boolean
  to: RouteLocationRaw
  /** People in the meeting, or the event's project. */
  detail: string | null
  color: string | null
}

const clock = (iso: string) => {
  const date = parseISO(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Today's meetings (including any running now) and calendar events, in time order. */
export function useTodayAgenda() {
  const auth = useAuthStore()
  const items = ref<AgendaItem[] | null>(null)

  async function load() {
    const today = toDateInput(new Date())
    const [events, meetings] = await Promise.all([
      auth.hasFeature('calendar') ? calendarApi.list(today, today).catch(() => []) : Promise.resolve([]),
      auth.hasFeature('meetings') ? meetingsApi.list('upcoming').catch(() => []) : Promise.resolve([]),
    ])
    const fromMeetings: AgendaItem[] = meetings
      .filter((meeting) => meeting.status === 'live' || (meeting.status === 'scheduled' && isToday(parseISO(meeting.startsAt))))
      .map((meeting) => ({
        id: `meeting-${meeting.id}`,
        kind: 'meeting',
        title: meeting.title,
        start: clock(meeting.startsAt),
        end: clock(meeting.endsAt),
        live: meeting.status === 'live',
        to: { name: 'meeting-room', params: { meetingId: meeting.id } },
        detail: meeting.participants?.length ? `${meeting.participants.length} people` : null,
        color: null,
      }))
    const fromEvents: AgendaItem[] = events
      .filter((event) => event.status !== 'cancelled')
      .map((event) => ({
        id: `event-${event.id}`,
        kind: 'event',
        title: event.title,
        start: event.allDay ? null : event.startTime,
        end: event.allDay ? null : event.endTime,
        live: false,
        to: { name: 'calendar' },
        detail: event.project?.name ?? event.location ?? null,
        color: event.project?.color ?? null,
      }))
    items.value = [...fromMeetings, ...fromEvents].sort((a, b) => Number(b.live) - Number(a.live) || (a.start ?? '').localeCompare(b.start ?? ''))
  }

  onMounted(load)
  return { items, reload: load }
}
