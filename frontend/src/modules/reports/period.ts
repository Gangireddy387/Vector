import { endOfMonth, endOfQuarter, endOfYear, min, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears } from 'date-fns'
import { formatDate, toDateInput } from '@/lib/format'

export interface Period {
  from: string
  to: string
}

/** Review periods that line up with how bonuses and appraisals are usually decided. */
export const PERIOD_PRESETS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
] as const

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value']

export function presetRange(key: PeriodPreset): Period {
  const now = new Date()
  const upToToday = (start: Date, end: Date) => ({ from: toDateInput(start), to: toDateInput(min([end, now])) })
  switch (key) {
    case 'this_month':
      return upToToday(startOfMonth(now), endOfMonth(now))
    case 'last_month':
      return upToToday(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)))
    case 'this_quarter':
      return upToToday(startOfQuarter(now), endOfQuarter(now))
    case 'last_quarter':
      return upToToday(startOfQuarter(subQuarters(now, 1)), endOfQuarter(subQuarters(now, 1)))
    case 'last_6_months':
      return upToToday(startOfMonth(subMonths(now, 5)), now)
    case 'this_year':
      return upToToday(startOfYear(now), endOfYear(now))
    case 'last_year':
      return upToToday(startOfYear(subYears(now, 1)), endOfYear(subYears(now, 1)))
  }
}

export const defaultReviewPeriod = () => presetRange('this_quarter')

export function describePeriod(period: Period) {
  const preset = PERIOD_PRESETS.find((option) => {
    const range = presetRange(option.value)
    return range.from === period.from && range.to === period.to
  })
  const range = `${formatDate(period.from, 'd MMM yyyy')} – ${formatDate(period.to, 'd MMM yyyy')}`
  return preset ? `${preset.label} (${range})` : range
}
