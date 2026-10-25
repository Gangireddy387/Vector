import { http } from '@/lib/http'
import type { IssuePriority, IssueType, ProjectReference, ProjectType, StatusSummary, UserSummary } from '@/types/models'

export interface SearchResults {
  issues: Array<{
    id: string
    key: string
    title: string
    type: IssueType
    priority: IssuePriority
    status: StatusSummary
    assignee: UserSummary | null
    project: ProjectReference
  }>
  projects: Array<ProjectReference & { type: ProjectType }>
  people: UserSummary[]
}

export const searchApi = {
  search: (q: string, limit = 10) => http.get<SearchResults>('/search', { params: { q, limit } }).then((r) => r.data),
}
