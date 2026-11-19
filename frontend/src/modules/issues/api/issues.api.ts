import { http } from '@/lib/http'
import type { Activity, CustomFieldValue, Issue, IssueDetail, IssueLinkType, IssuePriority, IssueType } from '@/types/models'

export interface IssueFilters {
  projectId?: string
  assigneeId?: string
  reporterId?: string
  statusId?: string
  statusCategory?: string
  type?: string
  priority?: string
  labelId?: string
  sprintId?: string
  parentId?: string
  q?: string
  dueFrom?: string
  dueTo?: string
  overdue?: 'true'
  sort?: 'position' | 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'key'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface IssueFields {
  title: string
  description: string | null
  type: IssueType
  priority: IssuePriority
  statusId: string
  assigneeId: string | null
  parentId: string | null
  sprintId: string | null
  storyPoints: number | null
  estimateMinutes: number | null
  startDate: string | null
  dueDate: string | null
  labelIds: string[]
  /** Custom field values keyed by field id. */
  customFields: Record<string, CustomFieldValue>
}

export type CreateIssueInput = Partial<IssueFields> & {
  projectId: string
  title: string
  templateId?: string
  subtaskTitles?: string[]
}

export type UpdateIssueInput = Partial<IssueFields> & {
  position?: number
  /** Sent when a workflow transition requires a comment. */
  transitionComment?: string
}

export interface BulkChanges {
  statusId?: string
  /** Cross-project bulk: resolve each issue's project status of this category. */
  statusCategory?: 'todo' | 'in_progress' | 'done'
  assigneeId?: string | null
  priority?: IssuePriority
  type?: IssueType
  sprintId?: string | null
  dueDate?: string | null
  addLabelIds?: string[]
}

export interface IssueImportResult {
  projectId: string
  projectKey: string
  created: number
  skipped: number
  failed: number
  issues: Array<{ id: string; key: string; title: string; row: number }>
  errors: Array<{ row: number; message: string }>
}

const clean = (filters: IssueFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''))

export const issuesApi = {
  list: (filters: IssueFilters) =>
    http.get<{ issues: Issue[]; total: number }>('/issues', { params: clean(filters) }).then((r) => r.data),
  exportCsv: async (filters: IssueFilters = {}) => {
    const response = await http.get<Blob>('/issues/export', { params: clean({ ...filters, limit: 1000 }), responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    Object.assign(document.createElement('a'), { href: url, download: 'vector-tasks.csv' }).click()
    URL.revokeObjectURL(url)
  },
  importCsv: (projectId: string, file: File) => {
    const body = new FormData()
    body.append('projectId', projectId)
    body.append('file', file)
    return http.post<IssueImportResult>('/issues/import', body, { timeout: 120000 }).then((r) => r.data)
  },
  myWork: () => http.get<{ issues: Issue[] }>('/issues/my-work').then((r) => r.data.issues),
  get: (idOrKey: string) => http.get<{ issue: IssueDetail }>(`/issues/${idOrKey}`).then((r) => r.data.issue),
  create: (input: CreateIssueInput) => http.post<{ issue: IssueDetail }>('/issues', input).then((r) => r.data.issue),
  update: (issueId: string, changes: UpdateIssueInput) =>
    http.patch<{ issue: IssueDetail }>(`/issues/${issueId}`, changes).then((r) => r.data.issue),
  move: (
    issueId: string,
    payload: { statusId?: string; sprintId?: string | null; position: number; transitionComment?: string },
  ) =>
    http.patch(`/issues/${issueId}/move`, payload),
  remove: (issueId: string) => http.delete(`/issues/${issueId}`),
  bulkUpdate: (issueIds: string[], changes: BulkChanges) =>
    http.patch<{ updated: number }>('/issues/bulk', { issueIds, changes }).then((r) => r.data),
  bulkDelete: (issueIds: string[]) => http.post<{ deleted: number }>('/issues/bulk-delete', { issueIds }).then((r) => r.data),
  watch: (issueId: string, userId?: string) =>
    http.post<{ issue: IssueDetail }>(`/issues/${issueId}/watchers`, userId ? { userId } : {}).then((r) => r.data.issue),
  unwatch: (issueId: string) => http.delete<{ issue: IssueDetail }>(`/issues/${issueId}/watchers`).then((r) => r.data.issue),
  removeWatcher: (issueId: string, userId: string) =>
    http.delete<{ issue: IssueDetail }>(`/issues/${issueId}/watchers/${userId}`).then((r) => r.data.issue),
  addLink: (issueId: string, payload: { targetIssue: string; type: IssueLinkType }) =>
    http.post<{ issue: IssueDetail }>(`/issues/${issueId}/links`, payload).then((r) => r.data.issue),
  removeLink: (linkId: string) => http.delete(`/issue-links/${linkId}`),
  addExternalLink: (issueId: string, payload: { url: string }) =>
    http.post<{ issue: IssueDetail }>(`/issues/${issueId}/external-links`, payload).then((r) => r.data.issue),
  removeExternalLink: (linkId: string) => http.delete(`/issue-external-links/${linkId}`),
  activity: (issueId: string) => http.get<{ activities: Activity[] }>(`/issues/${issueId}/activity`).then((r) => r.data.activities),
}
