import { http } from '@/lib/http'
import type { Activity, Issue, Project, Sprint, SprintStats, UserSummary } from '@/types/models'

export interface StandupPendingItem {
  projectId: string
  projectName: string
  projectColor: string
  date: string
}

export interface MeetingActionHomeItem {
  meetingId: string
  title: string
  endedAt: string | null
  openCount: number
  preview: string[]
  contextType: string | null
  contextId: string | null
}

export interface StandupRollupItem {
  projectId: string
  projectName: string
  projectKey?: string
  projectColor: string
  date: string
  posted: number
  expected: number
  missing: UserSummary[]
  postedPeople?: UserSummary[]
  blockers: Array<{ user: UserSummary; blockers: string }>
}

export interface DashboardData {
  stats: { open: number; inProgress: number; overdue: number; dueToday: number; dueThisWeek: number; completedThisWeek: number }
  myWork: Issue[]
  projects: Project[]
  activeSprints: Array<Sprint & SprintStats & { project: Project | null }>
  recentActivity: Activity[]
  standupPending: StandupPendingItem[]
  meetingActions: MeetingActionHomeItem[]
  standupRollup: StandupRollupItem[]
}

export const dashboardApi = {
  get: () => http.get<DashboardData>('/dashboard').then((r) => r.data),
}
