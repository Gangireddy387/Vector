import type { RecurringTask } from '@/types/models'

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ordinal = (day: number) => {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix}`
}

export function describeSchedule(task: Pick<RecurringTask, 'frequency' | 'dayOfWeek' | 'dayOfMonth' | 'timeOfDay'>) {
  switch (task.frequency) {
    case 'daily':
      return `Every day at ${task.timeOfDay}`
    case 'weekdays':
      return `Every weekday at ${task.timeOfDay}`
    case 'weekly':
      return `Every ${WEEKDAY_NAMES[task.dayOfWeek ?? 1]} at ${task.timeOfDay}`
    case 'monthly':
      return `Monthly on the ${ordinal(task.dayOfMonth ?? 1)} at ${task.timeOfDay}`
  }
}
