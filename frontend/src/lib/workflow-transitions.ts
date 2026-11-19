import type { Status, WorkflowTransitionRule } from '@/types/models'

/** Statuses an issue may move to from `fromStatusId`. No rule = unrestricted. Always includes current. */
export function allowedStatusesFor(
  statuses: Status[],
  transitions: WorkflowTransitionRule[] | undefined,
  fromStatusId: string | null | undefined,
): Status[] {
  if (!fromStatusId) return statuses
  const rule = (transitions ?? []).find((item) => item.fromStatusId === fromStatusId)
  if (!rule) return statuses
  const allowed = new Set([fromStatusId, ...(rule.toStatusIds ?? [])])
  return statuses.filter((status) => allowed.has(status.id))
}

export function transitionRuleFor(
  transitions: WorkflowTransitionRule[] | undefined,
  fromStatusId: string | null | undefined,
): WorkflowTransitionRule | null {
  if (!fromStatusId) return null
  return (transitions ?? []).find((item) => item.fromStatusId === fromStatusId) ?? null
}
