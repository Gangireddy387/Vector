import { http } from '@/lib/http'
import type { Sprint } from '@/types/models'

export interface SprintInput {
  name?: string
  goal?: string | null
  startDate?: string | null
  endDate?: string | null
}

export type CarryOverTarget = 'backlog' | 'new_sprint' | 'next_sprint' | string

export const sprintsApi = {
  list: (projectId: string) => http.get<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`).then((r) => r.data.sprints),
  create: (projectId: string, input: SprintInput) =>
    http.post<{ sprint: Sprint }>(`/projects/${projectId}/sprints`, input).then((r) => r.data.sprint),
  update: (projectId: string, sprintId: string, input: SprintInput) =>
    http.patch<{ sprint: Sprint }>(`/projects/${projectId}/sprints/${sprintId}`, input).then((r) => r.data.sprint),
  start: (projectId: string, sprintId: string, input: { goal?: string | null; startDate?: string; endDate?: string }) =>
    http.post<{ sprint: Sprint }>(`/projects/${projectId}/sprints/${sprintId}/start`, input).then((r) => r.data.sprint),
  complete: (projectId: string, sprintId: string, moveIncompleteTo?: CarryOverTarget) =>
    http.post<{ sprint: Sprint }>(`/projects/${projectId}/sprints/${sprintId}/complete`, { moveIncompleteTo }).then((r) => r.data.sprint),
  remove: (projectId: string, sprintId: string) => http.delete(`/projects/${projectId}/sprints/${sprintId}`),
}
