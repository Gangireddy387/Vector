import { http } from '@/lib/http'
import type { IssuePriority, IssueType, ProjectRole, UserSummary } from '@/types/models'
import type { IssueRefStatus } from '@/modules/chat/chat.api'

export interface StandupIssue {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  dueDate: string | null
  status: IssueRefStatus | null
}

export interface StandupUpdate {
  id: string
  projectId: string
  userId: string
  date: string
  yesterday: string | null
  today: string | null
  blockers: string | null
  issueIds: string[]
  createdAt: string
  updatedAt: string
}

export interface StandupMember {
  user: UserSummary
  role: ProjectRole
  update: StandupUpdate | null
  signals: { completed: StandupIssue[]; inProgress: StandupIssue[]; overdue: number }
}

export interface StandupDay {
  date: string
  previousDate: string
  members: StandupMember[]
  issues: Record<string, StandupIssue>
  stats: { posted: number; expected: number; blockers: number; completed: number }
  recentDays: Array<{ date: string; count: number }>
}

export interface StandupDraft {
  source: 'openai' | 'heuristic'
  date: string
  previousDate: string
  yesterday: string
  today: string
  blockers: string
  facts: { completed: number; moved: number; discussed: number; inProgress: number; overdue: number; blocked: number }
}

export interface StandupInput {
  date: string
  yesterday: string
  today: string
  blockers: string
}

export const standupApi = {
  day: (projectId: string, date: string) => http.get<StandupDay>(`/projects/${projectId}/standups`, { params: { date } }).then((r) => r.data),
  save: (projectId: string, input: StandupInput) =>
    http.put<{ update: StandupUpdate | null }>(`/projects/${projectId}/standups/me`, input).then((r) => r.data.update),
  remove: (projectId: string, date: string) => http.delete(`/projects/${projectId}/standups/me`, { params: { date } }),
  draft: (projectId: string, date: string) => http.post<StandupDraft>(`/projects/${projectId}/standups/draft`, { date }).then((r) => r.data),
}
