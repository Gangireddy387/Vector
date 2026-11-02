import type { AttendanceEntry } from './meetings.api'

/** "1 h 05 min", "12 min", "40 s" */
export function attendanceDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** A spreadsheet cell: quoted, and never read as a formula (names are typed by guests). */
function cell(value: string | number | null) {
  let text = value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

const KINDS: Record<AttendanceEntry['kind'], string> = { member: 'Member', guest: 'Guest', phone: 'Phone' }

/** The attendance report as CSV (Excel, Google Sheets), times in ISO 8601. */
export function attendanceCsv(entries: AttendanceEntry[]) {
  const header = ['Name', 'Email', 'Type', 'First joined', 'Last left', 'Minutes in call', 'Times joined']
  const rows = entries.map((entry) => [
    entry.name,
    entry.email,
    KINDS[entry.kind],
    entry.firstJoinedAt,
    entry.inCall ? 'Still in the call' : entry.lastLeftAt,
    Math.round(entry.seconds / 6) / 10,
    entry.sessions,
  ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}
