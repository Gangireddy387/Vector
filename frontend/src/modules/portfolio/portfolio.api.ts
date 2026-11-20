import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'
import type { PortfolioHealth } from './lib/portfolio-health'

export interface PortfolioIssueCounts {
  total: number
  open: number
  done: number
  overdue: number
  todo: number
  inProgress: number
}

export interface PortfolioSprint {
  id: string
  name: string
  state: string
  startDate: string | null
  endDate: string | null
  issueCount: number
  doneCount: number
  progressPercent: number
}

export interface PortfolioProject {
  id: string
  name: string
  key: string
  color: string
  type: 'scrum' | 'kanban'
  lead: UserSummary | null
  myRole: string
  isMember: boolean
  archivedAt: string | null
  issues: PortfolioIssueCounts
  progressPercent: number
  health: PortfolioHealth
  activeSprint: PortfolioSprint | null
  members: { count: number; preview: UserSummary[] }
}

export interface PortfolioTotals {
  projects: number
  open: number
  done: number
  overdue: number
  todo: number
  inProgress: number
  atRisk: number
  onTrack: number
  complete: number
  empty: number
}

export interface PortfolioRollup {
  totals: PortfolioTotals
  projects: PortfolioProject[]
}

export const portfolioApi = {
  rollup: (params?: { includeArchived?: boolean }) =>
    http.get<PortfolioRollup>('/portfolio/rollup', { params }).then((r) => r.data),
}
