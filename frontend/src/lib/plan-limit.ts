import axios from 'axios'
import { toast } from 'vue-sonner'
import type { Router } from 'vue-router'
import { getErrorMessage } from '@/lib/http'
import type { UpgradeTarget } from '@/modules/admin/admin.api'

type PlanLimitKind = 'members' | 'projects'

interface PlanLimitDetails {
  code?: string
  limit?: PlanLimitKind
}

/** Reads `plan_limit` from an API error (members or projects). */
export function getPlanLimitKind(error: unknown): PlanLimitKind | null {
  if (!axios.isAxiosError(error)) return null
  const details = error.response?.data?.details as PlanLimitDetails | undefined
  if (!details || details.code !== 'plan_limit') return null
  if (details.limit === 'members' || details.limit === 'projects') return details.limit
  return null
}

export function planLimitTarget(kind: PlanLimitKind): UpgradeTarget {
  return kind === 'members' ? 'seats' : 'projects'
}

/**
 * If the error is a plan limit, toast with a path to request more from the portal.
 * Returns true when handled so callers can skip a generic toast.
 */
export function toastPlanLimit(
  error: unknown,
  options: { router: Router; isAdmin: boolean; fallbackToast?: boolean } ,
): boolean {
  const kind = getPlanLimitKind(error)
  if (!kind) {
    if (options.fallbackToast !== false) toast.error(getErrorMessage(error))
    return false
  }
  const target = planLimitTarget(kind)
  const label = kind === 'members' ? 'Request more people' : 'Request more projects'
  toast.error(getErrorMessage(error), {
    duration: 8_000,
    action: {
      label: options.isAdmin ? label : 'View plan',
      onClick: () => {
        void options.router.push({
          name: 'workspace-admin',
          query: { tab: 'plan', ...(options.isAdmin ? { request: target } : {}) },
        })
      },
    },
  })
  return true
}
