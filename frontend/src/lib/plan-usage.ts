/** Shared seat/project usage math for plan meters. */

export function usagePercent(used: number, limit: number | null | undefined): number {
  if (limit == null || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

export function usageIndicatorClass(percent: number): string {
  if (percent >= 100) return 'bg-destructive'
  if (percent >= 80) return 'bg-warning'
  return 'bg-primary'
}

export function usageWarningClass(percent: number): string {
  return percent >= 100 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'
}

export function usageWarningLabel(percent: number): string {
  return percent >= 100 ? 'Limit reached.' : 'Nearing the limit.'
}

export function isNearLimit(used: number, limit: number | null | undefined, threshold = 80): boolean {
  if (limit == null) return false
  return usagePercent(used, limit) >= threshold
}

export function hasFiniteLimits(limits: { members: number | null; projects: number | null } | null | undefined): boolean {
  if (!limits) return false
  return limits.members != null || limits.projects != null
}
