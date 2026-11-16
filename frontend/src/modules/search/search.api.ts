import { http } from '@/lib/http'
import type { IssuePriority, IssueType, ProjectReference, ProjectType, StatusSummary, UserSummary } from '@/types/models'

export type SearchScope = 'all' | 'issues' | 'projects' | 'people'
export type SearchMatchField = 'key' | 'title' | 'description' | 'comment' | 'label'

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
    matchedOn?: SearchMatchField
  }>
  projects: Array<ProjectReference & { type: ProjectType }>
  people: UserSummary[]
}

export const searchApi = {
  search: (q: string, limit = 10, scope: SearchScope = 'all') =>
    http.get<SearchResults>('/search', { params: { q, limit, scope } }).then((r) => r.data),
}
