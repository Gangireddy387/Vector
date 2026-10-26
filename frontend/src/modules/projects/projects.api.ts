import { http } from '@/lib/http'
import type {
  Activity,
  Label,
  Project,
  ProjectDetail,
  ProjectRole,
  ProjectSettings,
  ProjectType,
  Status,
  StatusCategory,
  UserSummary,
} from '@/types/models'

export interface ProjectInput {
  name: string
  key: string
  description?: string | null
  type: ProjectType
  color?: string
  /** Create the project straight into a team (organization admins). */
  teamId?: string | null
}

export interface ProjectChanges {
  name?: string
  description?: string | null
  type?: ProjectType
  color?: string
  leadId?: string | null
  archived?: boolean
  settings?: Partial<ProjectSettings>
}

export interface StatusInput {
  name: string
  category: StatusCategory
  color?: string
  wipLimit?: number | null
}

export const projectsApi = {
  list: (includeArchived = false) =>
    http.get<{ projects: Project[] }>('/projects', { params: { includeArchived } }).then((r) => r.data.projects),
  get: (projectId: string) => http.get<{ project: ProjectDetail }>(`/projects/${projectId}`).then((r) => r.data.project),
  create: (input: ProjectInput) => http.post<{ project: ProjectDetail }>('/projects', input).then((r) => r.data.project),
  update: (projectId: string, changes: ProjectChanges) =>
    http.patch<{ project: ProjectDetail }>(`/projects/${projectId}`, changes).then((r) => r.data.project),
  remove: (projectId: string) => http.delete(`/projects/${projectId}`),

  addMember: (projectId: string, payload: { email: string; role: ProjectRole }) =>
    http.post<{ member: UserSummary & { invited: boolean } }>(`/projects/${projectId}/members`, payload).then((r) => r.data.member),
  updateMember: (projectId: string, userId: string, role: ProjectRole) => http.patch(`/projects/${projectId}/members/${userId}`, { role }),
  removeMember: (projectId: string, userId: string) => http.delete(`/projects/${projectId}/members/${userId}`),

  createStatus: (projectId: string, input: StatusInput) =>
    http.post<{ status: Status }>(`/projects/${projectId}/statuses`, input).then((r) => r.data.status),
  updateStatus: (projectId: string, statusId: string, changes: Partial<StatusInput>) =>
    http.patch<{ status: Status }>(`/projects/${projectId}/statuses/${statusId}`, changes).then((r) => r.data.status),
  reorderStatuses: (projectId: string, statusIds: string[]) =>
    http.put<{ statuses: Status[] }>(`/projects/${projectId}/statuses/order`, { statusIds }).then((r) => r.data.statuses),
  removeStatus: (projectId: string, statusId: string, moveIssuesTo?: string) =>
    http.delete(`/projects/${projectId}/statuses/${statusId}`, { params: { moveIssuesTo } }),

  createLabel: (projectId: string, input: { name: string; color: string }) =>
    http.post<{ label: Label }>(`/projects/${projectId}/labels`, input).then((r) => r.data.label),
  updateLabel: (projectId: string, labelId: string, changes: { name?: string; color?: string }) =>
    http.patch<{ label: Label }>(`/projects/${projectId}/labels/${labelId}`, changes).then((r) => r.data.label),
  removeLabel: (projectId: string, labelId: string) => http.delete(`/projects/${projectId}/labels/${labelId}`),

  activity: (projectId: string, limit = 50) =>
    http.get<{ activities: Activity[] }>(`/projects/${projectId}/activity`, { params: { limit } }).then((r) => r.data.activities),
}

export const usersApi = {
  search: (params: { q?: string; projectId?: string }) =>
    http.get<{ users: UserSummary[] }>('/users', { params }).then((r) => r.data.users),
}
