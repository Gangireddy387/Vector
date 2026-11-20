import { http } from '@/lib/http'
import type { Issue, IssueDetail, Sprint } from '@/types/models'

export interface RoadmapPayload {
  projectId: string
  projectType: 'scrum' | 'kanban'
  issues: Issue[]
  sprints: Sprint[]
}

export interface RoadmapRescheduleInput {
  startDate?: string | null
  dueDate?: string | null
  sprintId?: string | null
  parentId?: string | null
}

export const roadmapApi = {
  get: (projectId: string) =>
    http.get<RoadmapPayload>(`/projects/${projectId}/roadmap`).then((r) => r.data),
  reschedule: (projectId: string, issueId: string, changes: RoadmapRescheduleInput) =>
    http
      .patch<{ issue: IssueDetail }>(`/projects/${projectId}/roadmap/issues/${issueId}`, changes)
      .then((r) => r.data.issue),
}
