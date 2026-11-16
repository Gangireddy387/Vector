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
  /** The recap of a meeting about this project, posted when it ended (the text carries everything). */
  | { type: 'meeting_recap'; meetingId: string }
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

/** The emojis people can react with, in the picker's order. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const

export interface ChatReaction {
  emoji: string
  userIds: string[]
}

/** A file shared in project chat (same shape as a call / channel attachment). */
export interface ChatFile {
  id: string
  fileName: string
  mimeType: string
  size: number
}

export interface ChatMessage {
  id: string
  projectId: string
  authorId: string | null
  parentId?: string | null
  kind: 'user' | 'bot'
  body: string
  meta: AssistantMeta | null
  editedAt: string | null
  createdAt: string
  author: UserSummary | null
  issues: ChatIssueRef[]
  reactions?: ChatReaction[]
  files?: ChatFile[]
}

export type ChatSendPayload = {
  body: string
  parentId?: string | null
  fileIds?: string[]
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
      .get<{ messages: ChatMessage[]; replies: ChatMessage[]; hasMore: boolean; commands: AssistantCommand[] }>(`/projects/${projectId}/chat/messages`, { params })
      .then((r) => r.data),
  send: (projectId: string, payload: ChatSendPayload) =>
    http
      .post<{ message: ChatMessage; reply: ChatMessage | null }>(`/projects/${projectId}/chat/messages`, {
        body: payload.body,
        ...(payload.parentId ? { parentId: payload.parentId } : {}),
        ...(payload.fileIds?.length ? { fileIds: payload.fileIds } : {}),
      })
      .then((r) => r.data),
  edit: (messageId: string, body: string) => http.patch<{ message: ChatMessage }>(`/chat/messages/${messageId}`, { body }).then((r) => r.data.message),
  remove: (messageId: string) => http.delete(`/chat/messages/${messageId}`),
  /** Adds your reaction, or takes it back. */
  react: (messageId: string, emoji: string) =>
    http.post<{ messageId: string; reactions: ChatReaction[] }>(`/chat/messages/${messageId}/reactions`, { emoji }).then((r) => r.data),
  /** Uploads a file to share in the project chat; send its id with the message. */
  upload: (projectId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return http
      .post<{ file: ChatFile }>(`/projects/${projectId}/chat/files`, form, {
        timeout: 0,
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.file)
  },
  fileLink: (projectId: string, fileId: string) =>
    http.get<{ url: string }>(`/projects/${projectId}/chat/files/${fileId}/link`).then((r) => r.data.url),
  followups: (issueId: string) => http.get<{ followups: Followup[] }>(`/issues/${issueId}/followups`).then((r) => r.data.followups),
}
