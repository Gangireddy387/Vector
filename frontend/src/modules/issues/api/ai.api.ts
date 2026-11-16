import { http } from '@/lib/http'
import type { IssuePriority, IssueType } from '@/types/models'

export type AiSource = 'openai' | 'heuristic' | 'degraded'

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
    focusActions?: Array<{ text: string; issueKey: string | null }>
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

export function aiSourceHint(source: AiSource | undefined): string | undefined {
  if (source === 'heuristic') return 'Smart suggestions — add an OpenAI key on the server for richer AI.'
  if (source === 'degraded') return 'OpenAI was unavailable; used smart suggestions instead.'
  return undefined
}

export const aiApi = {
  status: () => http.get<{ enabled: boolean; provider: 'openai' | 'heuristic' }>('/ai/status').then((r) => r.data),
  dailyBriefing: () => http.get<DailyBriefing>('/ai/daily-briefing').then((r) => r.data),
  draftIssue: (payload: { projectId: string; title: string; description?: string | null }) =>
    http.post<IssueDraft>('/ai/draft-issue', payload).then((r) => r.data),
  summarize: (issueId: string) => http.post<IssueSummary>(`/ai/issues/${issueId}/summary`).then((r) => r.data),
  breakdown: (issueId: string) =>
    http.post<{ source: AiSource; subtasks: string[] }>(`/ai/issues/${issueId}/breakdown`).then((r) => r.data),
}
