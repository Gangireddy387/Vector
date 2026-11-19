import { http } from '@/lib/http'
import type { IssuePriority, IssueType, StatusCategory } from '@/types/models'

export interface ShareLinkState {
  enabled: boolean
  token: string | null
  createdAt?: string
}

export interface PublicShareUser {
  id: string
  name: string
  avatarUrl: string | null
  avatarColor: string
}

export interface PublicShareStatus {
  id: string
  name: string
  category: StatusCategory
  color: string
}

export interface PublicShareIssueCard {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  dueDate: string | null
  storyPoints: number | null
  status: PublicShareStatus | null
  assignee: PublicShareUser | null
  labels: { id: string; name: string; color: string }[]
  parent: { id: string; key: string; title: string; type: IssueType } | null
  subtaskProgress: { total: number; done: number }
  commentCount: number
  attachmentCount: number
}

export interface PublicSharePayload {
  organization: { id: string; name: string; logoUrl: string | null }
  project: { id: string; key: string; name: string; color: string; type: 'scrum' | 'kanban' }
  scope: 'board' | 'issue'
  sprint?: { id: string; name: string; state: string } | null
  columns?: { status: PublicShareStatus; issues: PublicShareIssueCard[] }[]
  issue?: PublicShareIssueCard & {
    description: string | null
    reporter: PublicShareUser | null
    sprint: { id: string; name: string; state: string } | null
    subtasks: { id: string; key: string; title: string; type: IssueType; status: PublicShareStatus | null }[]
  }
}

export const shareLinkUrl = (token: string) => `${window.location.origin}/share/${token}`

export const sharesApi = {
  getBoardShare: (projectId: string) => http.get<{ share: ShareLinkState }>(`/projects/${projectId}/share-link`).then((r) => r.data.share),
  setBoardShare: (projectId: string, enabled: boolean, reset = false) =>
    http.post<{ share: ShareLinkState }>(`/projects/${projectId}/share-link`, { enabled, reset }).then((r) => r.data.share),
  getIssueShare: (issueId: string) => http.get<{ share: ShareLinkState }>(`/issues/${issueId}/share-link`).then((r) => r.data.share),
  setIssueShare: (issueId: string, enabled: boolean, reset = false) =>
    http.post<{ share: ShareLinkState }>(`/issues/${issueId}/share-link`, { enabled, reset }).then((r) => r.data.share),
  publicShare: (token: string) => http.get<PublicSharePayload>(`/share-links/${token}`).then((r) => r.data),
}
