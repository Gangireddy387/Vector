import { http } from '@/lib/http'
import type { IssuePriority, IssueType, StatusCategory, UserSummary } from '@/types/models'

export interface IssueRefStatus {
  name: string
  color: string
  category: StatusCategory
}

export interface ChatIssueRef {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  projectId: string
  assigneeId: string | null
  status: IssueRefStatus | null
}

export interface AssistantIssueCard {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  dueDate: string | null
  status: IssueRefStatus | null
  assignee: UserSummary | null
  followups: number
}

export interface AssistantCommand {
  name: string
  usage: string
  description: string
}

export interface StandupDraftSections {
  yesterday: string
  today: string
  blockers: string
}

export type AssistantMeta = { replyTo?: string; requestedBy?: { id: string; name: string }; source?: string } & (
  | { type: 'help'; commands: AssistantCommand[] }
  | { type: 'standup_draft'; forUserId: string; date: string; draft: StandupDraftSections }
  | { type: 'issue_status'; issues: AssistantIssueCard[] }
  | { type: 'issue_list'; title: string; issues: AssistantIssueCard[]; total: number }
  | { type: 'answer'; issues: AssistantIssueCard[] }
  | {
      type: 'blockers'
      reported: Array<{ user: UserSummary; text: string }>
      blocked: Array<{ blocked: { key: string; title: string }; by: { key: string; title: string } }>
      overdue: AssistantIssueCard[]
    }
  | {
      type: 'standup_summary'
      date: string
      posted: number
      expected: number
      missing: string[]
      blockers: Array<{ user: UserSummary; text: string }>
      updates: Array<{ user: UserSummary; today: string | null; blockers: string | null }>
    }
)

export interface ChatMessage {
  id: string
  projectId: string
  authorId: string | null
  kind: 'user' | 'bot'
  body: string
  meta: AssistantMeta | null
  editedAt: string | null
  createdAt: string
  author: UserSummary | null
  issues: ChatIssueRef[]
}

export type Followup =
  | { type: 'chat'; id: string; at: string; kind: 'user' | 'bot'; author: UserSummary | null; body: string; projectId: string }
  | {
      type: 'standup'
      id: string
      at: string
      date: string
      author: UserSummary
      projectId: string
      sections: { yesterday: string[]; today: string[]; blockers: string[] }
    }

export const chatApi = {
  list: (projectId: string, params: { before?: string; limit?: number } = {}) =>
    http
      .get<{ messages: ChatMessage[]; hasMore: boolean; commands: AssistantCommand[] }>(`/projects/${projectId}/chat/messages`, { params })
      .then((r) => r.data),
  send: (projectId: string, body: string) =>
    http.post<{ message: ChatMessage; reply: ChatMessage | null }>(`/projects/${projectId}/chat/messages`, { body }).then((r) => r.data),
  edit: (messageId: string, body: string) => http.patch<{ message: ChatMessage }>(`/chat/messages/${messageId}`, { body }).then((r) => r.data.message),
  remove: (messageId: string) => http.delete(`/chat/messages/${messageId}`),
  followups: (issueId: string) => http.get<{ followups: Followup[] }>(`/issues/${issueId}/followups`).then((r) => r.data.followups),
}
