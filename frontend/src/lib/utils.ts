import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

/** Midpoint rank between two neighbours (fractional indexing used for drag & drop ordering). */
export function rankBetween(before?: number | null, after?: number | null) {
  if (before == null && after == null) return 1024
  if (before == null) return (after as number) - 1024
  if (after == null) return before + 1024
  return (before + after) / 2
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatMinutes(minutes: number) {
  if (!minutes) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ')
}

/** Parses durations such as "1h 30m", "90m", "2h" or "1.5" (hours). */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number.parseFloat(text) * 60)
  const hours = /(\d+(?:\.\d+)?)\s*h/.exec(text)
  const minutes = /(\d+)\s*m/.exec(text)
  if (!hours && !minutes) return null
  return Math.round((hours ? Number.parseFloat(hours[1]!) * 60 : 0) + (minutes ? Number.parseInt(minutes[1]!, 10) : 0))
}
