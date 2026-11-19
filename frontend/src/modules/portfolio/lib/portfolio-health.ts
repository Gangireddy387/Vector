import type { Project } from '@/types/models'

export type PortfolioHealth = 'on_track' | 'at_risk' | 'overdue' | 'done' | 'empty'

export const PORTFOLIO_HEALTH_META: Record<
  PortfolioHealth,
  { label: string; class: string; bar: string }
> = {
  on_track: { label: 'On track', class: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  at_risk: { label: 'At risk', class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' },
  overdue: { label: 'Overdue', class: 'bg-destructive/15 text-destructive', bar: 'bg-destructive' },
  done: { label: 'Complete', class: 'bg-primary/15 text-primary', bar: 'bg-primary' },
  empty: { label: 'No work', class: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40' },
}

export function completionOf(project: Project) {
  const summary = project.issueSummary
  if (!summary?.total) return 0
  return Math.round((summary.done / summary.total) * 100)
}

export function healthOf(project: Project): PortfolioHealth {
  const summary = project.issueSummary
  if (!summary?.total) return 'empty'
  if (summary.open === 0) return 'done'
  if ((summary.overdue ?? 0) > 0) return 'overdue'
  const completion = completionOf(project)
  const sprintEnd = project.activeSprint?.endDate
  if (sprintEnd) {
    const days = Math.ceil((new Date(`${sprintEnd}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    if (days <= 3 && completion < 70) return 'at_risk'
  }
  if (completion < 25 && summary.open >= 8) return 'at_risk'
  return 'on_track'
}
