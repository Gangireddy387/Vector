import { addDays } from 'date-fns'
import { toDateInput } from '@/lib/format'
import type { Issue } from '@/types/models'

export type WorkBucket = 'overdue' | 'today' | 'week' | 'later' | 'anytime' | 'done'

export const BUCKET_TITLES: Record<WorkBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Next 7 days',
  later: 'Later',
  anytime: 'No due date',
  done: 'Completed this week',
}

export function bucketOf(issue: Issue, today = toDateInput(new Date()), weekEnd = toDateInput(addDays(new Date(), 7))): WorkBucket {
  if (issue.status.category === 'done') return 'done'
  if (!issue.dueDate) return 'anytime'
  if (issue.dueDate < today) return 'overdue'
  if (issue.dueDate === today) return 'today'
  if (issue.dueDate <= weekEnd) return 'week'
  return 'later'
}

/** Groups "my work" into due-date buckets; open work keeps in-progress items first. */
export function groupMyWork(issues: Issue[]) {
  const groups = new Map<WorkBucket, Issue[]>()
  for (const issue of issues) {
    const bucket = bucketOf(issue)
    groups.set(bucket, [...(groups.get(bucket) ?? []), issue])
  }
  const order: WorkBucket[] = ['overdue', 'today', 'week', 'later', 'anytime', 'done']
  return order
    .filter((bucket) => groups.has(bucket))
    .map((bucket) => ({
      bucket,
      title: BUCKET_TITLES[bucket],
      issues: groups
        .get(bucket)!
        .sort((a, b) => Number(b.status.category === 'in_progress') - Number(a.status.category === 'in_progress')),
    }))
}
