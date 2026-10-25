import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

const toDate = (value: string | Date) => (typeof value === 'string' ? parseISO(value) : value)

export function formatDate(value?: string | Date | null, pattern = 'd MMM yyyy') {
  if (!value) return '—'
  const date = toDate(value)
  return isValid(date) ? format(date, pattern) : '—'
}

export function formatDateTime(value?: string | Date | null) {
  return formatDate(value, 'd MMM yyyy, HH:mm')
}

export function timeAgo(value?: string | Date | null) {
  if (!value) return ''
  const date = toDate(value)
  if (!isValid(date)) return ''
  const seconds = (Date.now() - date.getTime()) / 1000
  if (seconds < 45) return 'just now'
  return `${formatDistanceToNowStrict(date)} ago`
}

/** Local YYYY-MM-DD (matches the API's DATEONLY fields). */
export const toDateInput = (date: Date) => format(date, 'yyyy-MM-dd')

export const todayInput = () => toDateInput(new Date())

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export function getDueState(dueDate?: string | null, done = false): DueState {
  if (!dueDate || done) return 'none'
  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'later'
}

export function describeDue(dueDate?: string | null) {
  if (!dueDate) return 'No due date'
  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days === -1) return 'Due yesterday'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days < 7) return `Due ${format(parseISO(dueDate), 'EEEE')}`
  return `Due ${format(parseISO(dueDate), 'd MMM')}`
}
