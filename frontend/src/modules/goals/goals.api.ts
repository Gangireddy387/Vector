import { http } from '@/lib/http'
import type {
  Goal,
  GoalStatus,
  KeyResultCheckIn,
  KeyResultMetricType,
  ProjectReference,
  StatusSummary,
} from '@/types/models'

export interface GoalInput {
  title: string
  description?: string | null
  projectId?: string | null
  parentGoalId?: string | null
  ownerId?: string | null
  status?: GoalStatus
  periodStart?: string | null
  periodEnd?: string | null
}

export interface KeyResultInput {
  title: string
  metricType?: KeyResultMetricType
  startValue?: number
  targetValue?: number
  currentValue?: number
  unit?: string | null
  ownerId?: string | null
}

export interface LinkableIssue {
  id: string
  key: string
  title: string
  type: string
  projectId: string
  status?: StatusSummary
  project?: ProjectReference
}

export const goalsApi = {
  list: (filters: { status?: GoalStatus; projectId?: string } = {}) =>
    http.get<{ goals: Goal[] }>('/goals', { params: filters }).then((r) => r.data.goals),
  get: (goalId: string) => http.get<{ goal: Goal }>(`/goals/${goalId}`).then((r) => r.data.goal),
  create: (input: GoalInput) => http.post<{ goal: Goal }>('/goals', input).then((r) => r.data.goal),
  update: (goalId: string, changes: Partial<GoalInput>) =>
    http.patch<{ goal: Goal }>(`/goals/${goalId}`, changes).then((r) => r.data.goal),
  remove: (goalId: string) => http.delete(`/goals/${goalId}`),
  createKeyResult: (goalId: string, input: KeyResultInput) =>
    http.post<{ goal: Goal }>(`/goals/${goalId}/key-results`, input).then((r) => r.data.goal),
  updateKeyResult: (goalId: string, keyResultId: string, changes: Partial<KeyResultInput>) =>
    http.patch<{ goal: Goal }>(`/goals/${goalId}/key-results/${keyResultId}`, changes).then((r) => r.data.goal),
  removeKeyResult: (goalId: string, keyResultId: string) =>
    http.delete<{ goal: Goal }>(`/goals/${goalId}/key-results/${keyResultId}`).then((r) => r.data.goal),
  listCheckIns: (goalId: string, keyResultId: string, limit = 30) =>
    http
      .get<{ checkIns: KeyResultCheckIn[] }>(`/goals/${goalId}/key-results/${keyResultId}/check-ins`, {
        params: { limit },
      })
      .then((r) => r.data.checkIns),
  createCheckIn: (goalId: string, keyResultId: string, payload: { value: number; note?: string | null }) =>
    http
      .post<{ goal: Goal; checkIn: KeyResultCheckIn }>(`/goals/${goalId}/key-results/${keyResultId}/check-ins`, payload)
      .then((r) => r.data),
  addLink: (goalId: string, keyResultId: string, issueId: string) =>
    http.post<{ goal: Goal }>(`/goals/${goalId}/key-results/${keyResultId}/links`, { issueId }).then((r) => r.data.goal),
  removeLink: (goalId: string, keyResultId: string, linkId: string) =>
    http.delete<{ goal: Goal }>(`/goals/${goalId}/key-results/${keyResultId}/links/${linkId}`).then((r) => r.data.goal),
  searchIssues: (q = '', limit = 20) =>
    http.get<{ issues: LinkableIssue[] }>('/goals/linkable-issues', { params: { q, limit } }).then((r) => r.data.issues),
}
