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

export const aiApi = {
  status: () => http.get<{ enabled: boolean; provider: AiSource }>('/ai/status').then((r) => r.data),
  draftIssue: (payload: { projectId: string; title: string; description?: string | null }) =>
    http.post<IssueDraft>('/ai/draft-issue', payload).then((r) => r.data),
  summarize: (issueId: string) => http.post<IssueSummary>(`/ai/issues/${issueId}/summary`).then((r) => r.data),
  breakdown: (issueId: string) =>
    http.post<{ source: AiSource; subtasks: string[] }>(`/ai/issues/${issueId}/breakdown`).then((r) => r.data),
}
