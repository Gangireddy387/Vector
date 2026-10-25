import { http } from '@/lib/http'
import type { Activity, Issue, IssueDetail, IssueLinkType, IssuePriority, IssueType } from '@/types/models'

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
}

export type CreateIssueInput = Partial<IssueFields> & {
  projectId: string
  title: string
  templateId?: string
  subtaskTitles?: string[]
}

export type UpdateIssueInput = Partial<IssueFields> & { position?: number }

export interface BulkChanges {
  statusId?: string
  assigneeId?: string | null
  priority?: IssuePriority
  type?: IssueType
  sprintId?: string | null
  dueDate?: string | null
  addLabelIds?: string[]
}

const clean = (filters: IssueFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''))

export const issuesApi = {
  list: (filters: IssueFilters) =>
    http.get<{ issues: Issue[]; total: number }>('/issues', { params: clean(filters) }).then((r) => r.data),
  myWork: () => http.get<{ issues: Issue[] }>('/issues/my-work').then((r) => r.data.issues),
  get: (idOrKey: string) => http.get<{ issue: IssueDetail }>(`/issues/${idOrKey}`).then((r) => r.data.issue),
  create: (input: CreateIssueInput) => http.post<{ issue: IssueDetail }>('/issues', input).then((r) => r.data.issue),
  update: (issueId: string, changes: UpdateIssueInput) =>
    http.patch<{ issue: IssueDetail }>(`/issues/${issueId}`, changes).then((r) => r.data.issue),
  move: (issueId: string, payload: { statusId?: string; sprintId?: string | null; position: number }) =>
    http.patch(`/issues/${issueId}/move`, payload),
  remove: (issueId: string) => http.delete(`/issues/${issueId}`),
  bulkUpdate: (issueIds: string[], changes: BulkChanges) =>
    http.patch<{ updated: number }>('/issues/bulk', { issueIds, changes }).then((r) => r.data),
  bulkDelete: (issueIds: string[]) => http.post<{ deleted: number }>('/issues/bulk-delete', { issueIds }).then((r) => r.data),
  watch: (issueId: string) => http.post(`/issues/${issueId}/watchers`),
  unwatch: (issueId: string) => http.delete(`/issues/${issueId}/watchers`),
  addLink: (issueId: string, payload: { targetIssue: string; type: IssueLinkType }) =>
    http.post<{ issue: IssueDetail }>(`/issues/${issueId}/links`, payload).then((r) => r.data.issue),
  removeLink: (linkId: string) => http.delete(`/issue-links/${linkId}`),
  activity: (issueId: string) => http.get<{ activities: Activity[] }>(`/issues/${issueId}/activity`).then((r) => r.data.activities),
}
