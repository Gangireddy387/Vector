import { http } from '@/lib/http'
import type { IssuePriority, IssueType } from '@/types/models'

type AiSource = 'openai' | 'heuristic'

export interface IssueDraft {
  source: AiSource
  type: IssueType
  priority: IssuePriority
  storyPoints: number
  description: string
  subtasks: string[]
  labelIds: string[]
}

export interface IssueSummary {
  source: AiSource
  summary: string
  keyPoints: string[]
  nextSteps: string[]
}

export interface DailyBriefing {
  needsMe: {
    source: AiSource
    headline: string
    focus: string[]
    watch: string[]
    tasks: {
      overdue: Array<{ id: string; key: string; title: string; dueDate: string | null; projectId: string }>
      dueToday: Array<{ id: string; key: string; title: string; dueDate: string | null; projectId: string }>
      inProgress: Array<{ id: string; key: string; title: string; projectId: string }>
    }
  }
  standupDrafts: Array<{
    projectId: string
    projectName: string
    projectColor: string
    date: string
    draft: { yesterday: string; today: string; blockers: string; source: AiSource }
  }>
  meetingPrep: Array<{ meetingId: string; title: string; startsAt: string; agenda: string; live: boolean }>
  generatedAt: string
}

export const aiApi = {
  status: () => http.get<{ enabled: boolean; provider: AiSource }>('/ai/status').then((r) => r.data),
  dailyBriefing: () => http.get<DailyBriefing>('/ai/daily-briefing').then((r) => r.data),
  draftIssue: (payload: { projectId: string; title: string; description?: string | null }) =>
    http.post<IssueDraft>('/ai/draft-issue', payload).then((r) => r.data),
  summarize: (issueId: string) => http.post<IssueSummary>(`/ai/issues/${issueId}/summary`).then((r) => r.data),
  breakdown: (issueId: string) =>
    http.post<{ source: AiSource; subtasks: string[] }>(`/ai/issues/${issueId}/breakdown`).then((r) => r.data),
}
