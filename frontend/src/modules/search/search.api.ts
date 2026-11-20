import { http } from '@/lib/http'
import type { IssuePriority, IssueType, ProjectReference, ProjectType, StatusSummary, UserSummary } from '@/types/models'

export type SearchScope = 'all' | 'issues' | 'projects' | 'people' | 'messages' | 'chat' | 'wiki'
export type SearchMatchField = 'key' | 'title' | 'description' | 'comment' | 'label' | 'body'

export interface SearchMessageHit {
  id: string
  conversationId: string
  kind: string
  title: string
  subject: string | null
  snippet: string
  author: UserSummary | null
  createdAt: string
}

export interface SearchChatHit {
  id: string
  projectId: string
  project: ProjectReference
  snippet: string
  author: UserSummary | null
  createdAt: string
}

export interface SearchWikiHit {
  id: string
  title: string
  excerpt: string
  matchedOn?: 'title' | 'body'
  updatedAt: string
}

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
  messages?: SearchMessageHit[]
  chat?: SearchChatHit[]
  wiki?: SearchWikiHit[]
  hasMore?: {
    issues: boolean
    projects: boolean
    people: boolean
    messages?: boolean
    chat?: boolean
    wiki?: boolean
  }
}

export const searchApi = {
  search: (q: string, limit = 10, scope: SearchScope = 'all', offset = 0) =>
    http.get<SearchResults>('/search', { params: { q, limit, scope, offset } }).then((r) => r.data),
}
