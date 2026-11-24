import { http } from '@/lib/http'
import type { IssuePriority, IssueType, StatusCategory } from '@/types/models'

export interface ShareLinkState {
  enabled: boolean
  token: string | null
  createdAt?: string
  hasPassword?: boolean
  expiresAt?: string | null
  guestCommentsEnabled?: boolean
}

export interface ShareLinkOptions {
  password?: string
  expiresAt?: string | null
  guestCommentsEnabled?: boolean
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

export interface PublicShareComment {
  id: string
  body: string
  createdAt: string
  authorName: string
  isGuest: boolean
}

export interface PublicSharePayload {
  locked?: boolean
  requiresPassword?: boolean
  accessToken?: string | null
  /** ISO datetime when the link stops working; client hides the view at that moment. */
  expiresAt?: string | null
  guestCommentsEnabled?: boolean
  comments?: PublicShareComment[]
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

const accessKey = (token: string) => `vector.shareAccess.${token}`

export function readShareAccessToken(token: string) {
  try {
    return sessionStorage.getItem(accessKey(token))
  } catch {
    return null
  }
}

export function writeShareAccessToken(token: string, accessToken: string | null) {
  try {
    if (accessToken) sessionStorage.setItem(accessKey(token), accessToken)
    else sessionStorage.removeItem(accessKey(token))
  } catch {
    // Private mode / blocked storage — unlock still works for this page load via caller state.
  }
}

function shareAuthHeaders(token: string) {
  const access = readShareAccessToken(token)
  return access ? { Authorization: `Bearer ${access}` } : undefined
}

export const sharesApi = {
  getBoardShare: (projectId: string) => http.get<{ share: ShareLinkState }>(`/projects/${projectId}/share-link`).then((r) => r.data.share),
  setBoardShare: (projectId: string, enabled: boolean, reset = false, options: ShareLinkOptions = {}) =>
    http
      .post<{ share: ShareLinkState }>(`/projects/${projectId}/share-link`, { enabled, reset, ...options })
      .then((r) => r.data.share),
  getIssueShare: (issueId: string) => http.get<{ share: ShareLinkState }>(`/issues/${issueId}/share-link`).then((r) => r.data.share),
  setIssueShare: (issueId: string, enabled: boolean, reset = false, options: ShareLinkOptions = {}) =>
    http
      .post<{ share: ShareLinkState }>(`/issues/${issueId}/share-link`, { enabled, reset, ...options })
      .then((r) => r.data.share),
  publicShare: (token: string) =>
    http.get<PublicSharePayload>(`/share-links/${token}`, { headers: shareAuthHeaders(token) }).then((r) => r.data),
  publicShareIssue: (token: string, issueId: string) =>
    http
      .get<PublicSharePayload>(`/share-links/${token}/issues/${issueId}`, { headers: shareAuthHeaders(token) })
      .then((r) => r.data),
  unlockShare: (token: string, password: string) =>
    http.post<PublicSharePayload>(`/share-links/${token}/unlock`, { password }).then((r) => {
      if (r.data.accessToken) writeShareAccessToken(token, r.data.accessToken)
      return r.data
    }),
  submitGuestComment: (token: string, input: { name: string; body: string; company?: string }) =>
    http
      .post<PublicShareComment>(`/share-links/${token}/comments`, input, { headers: shareAuthHeaders(token) })
      .then((r) => r.data),
}
