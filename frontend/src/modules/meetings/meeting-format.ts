import { differenceInMinutes, format, isToday, isTomorrow, parseISO } from 'date-fns'
import type { Meeting } from './meetings.api'

export const timeRange = (meeting: Meeting) => `${format(parseISO(meeting.startsAt), 'HH:mm')} – ${format(parseISO(meeting.endsAt), 'HH:mm')}`

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`
}

export function dayLabel(iso: string) {
  const date = parseISO(iso)
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEEE, d MMMM')
}

export type MeetingBadge = { label: string; tone: 'live' | 'soon' | 'planned' | 'ended' | 'cancelled' }

/** What a card says about the meeting right now, e.g. "Live now" or "Starts in 20 min". */
export function meetingBadge(meeting: Meeting, now: Date): MeetingBadge {
  if (meeting.status === 'cancelled') return { label: 'Cancelled', tone: 'cancelled' }
  if (meeting.status === 'ended') return { label: 'Ended', tone: 'ended' }
  if (meeting.status === 'live') return { label: 'Live now', tone: 'live' }
  const minutes = differenceInMinutes(parseISO(meeting.startsAt), now)
  if (parseISO(meeting.endsAt) < now) return meeting.startedAt ? { label: 'Ended', tone: 'ended' } : { label: 'Did not take place', tone: 'ended' }
  if (minutes <= 0) return { label: 'Starting now', tone: 'soon' }
  if (minutes < 60) return { label: `Starts in ${minutes} min`, tone: 'soon' }
  if (minutes < 24 * 60 && isToday(parseISO(meeting.startsAt))) return { label: `Starts in ${Math.round(minutes / 60)} h`, tone: 'planned' }
  return { label: 'Scheduled', tone: 'planned' }
}

export const BADGE_CLASSES: Record<MeetingBadge['tone'], string> = {
  live: 'bg-red-500/10 text-red-600 dark:text-red-400',
  soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  planned: 'bg-primary/10 text-primary',
  ended: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive line-through',
}

/** Live calls, and scheduled ones whose time is not over yet (people may join early). */
export const isJoinable = (meeting: Meeting, now = new Date()) => meeting.status === 'live' || (meeting.status === 'scheduled' && parseISO(meeting.endsAt) > now)
