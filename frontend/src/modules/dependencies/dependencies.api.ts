import { http } from '@/lib/http'
import type { IssuePriority, IssueType, UserSummary } from '@/types/models'

export interface DependencyNode {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  statusCategory: string
  statusName: string | null
  assignee: UserSummary | null
  estimateMinutes: number | null
  storyPoints: number | null
  effortMinutes: number
  done: boolean
  onCriticalPath: boolean
  layer: number
  blockedByOpen: number
}

export interface DependencyEdge {
  id: string
  from: string
  to: string
  type: 'blocks'
}

export interface ProjectDependencies {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  criticalPath: {
    issueIds: string[]
    lengthMinutes: number
    issues: Array<{ id: string; key: string; title: string; effortMinutes: number }>
  }
  blockedNow: Array<{
    id: string
    key: string
    title: string
    waitingOn: Array<{ id: string; key: string; title: string }>
  }>
  cycles: string[][]
  stats: {
    linkedIssues: number
    blockLinks: number
    openBlocked: number
    criticalPathLength: number
    cycleCount: number
  }
}

export const dependenciesApi = {
  forProject: (projectId: string) => http.get<ProjectDependencies>(`/projects/${projectId}/dependencies`).then((r) => r.data),
}
