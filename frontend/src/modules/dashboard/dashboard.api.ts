import { http } from '@/lib/http'
import type { Activity, Issue, Project, Sprint, SprintStats } from '@/types/models'

export interface DashboardData {
  stats: { open: number; inProgress: number; overdue: number; dueToday: number; dueThisWeek: number; completedThisWeek: number }
  myWork: Issue[]
  projects: Project[]
  activeSprints: Array<Sprint & SprintStats & { project: Project | null }>
  recentActivity: Activity[]
}

export const dashboardApi = {
  get: () => http.get<DashboardData>('/dashboard').then((r) => r.data),
}
