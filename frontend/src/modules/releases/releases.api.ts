import { http } from '@/lib/http'
import type { IssuePriority, IssueType, StatusSummary, Version, VersionStatus } from '@/types/models'

export interface VersionStats {
  issueCount: number
  doneCount: number
}

export interface VersionSummary extends Version {
  hasReleaseNotes: boolean
  stats: VersionStats
}

export interface VersionIssueRow {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  status: StatusSummary | null
}

export interface VersionDetail {
  version: VersionSummary & { releaseNotes: string | null }
  issues: VersionIssueRow[]
}

export type CreateVersionInput = {
  name: string
  description?: string | null
  startDate?: string | null
  releaseDate?: string | null
  releaseNotes?: string | null
}

export type UpdateVersionInput = Partial<{
  name: string
  description: string | null
  startDate: string | null
  releaseDate: string | null
  releaseNotes: string | null
  status: VersionStatus
  position: number
}>

export const releasesApi = {
  list: (projectId: string, status?: VersionStatus) =>
    http
      .get<{ versions: VersionSummary[] }>(`/projects/${projectId}/versions`, {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data.versions),
  get: (projectId: string, versionId: string) =>
    http.get<VersionDetail>(`/projects/${projectId}/versions/${versionId}`).then((r) => r.data),
  create: (projectId: string, input: CreateVersionInput) =>
    http.post<{ version: VersionSummary }>(`/projects/${projectId}/versions`, input).then((r) => r.data.version),
  update: (projectId: string, versionId: string, input: UpdateVersionInput) =>
    http
      .patch<{ version: VersionSummary }>(`/projects/${projectId}/versions/${versionId}`, input)
      .then((r) => r.data.version),
  release: (projectId: string, versionId: string) =>
    http.post<VersionDetail>(`/projects/${projectId}/versions/${versionId}/release`).then((r) => r.data),
  archive: (projectId: string, versionId: string) =>
    http
      .post<{ version: VersionSummary }>(`/projects/${projectId}/versions/${versionId}/archive`)
      .then((r) => r.data.version),
  reopen: (projectId: string, versionId: string) =>
    http
      .post<{ version: VersionSummary }>(`/projects/${projectId}/versions/${versionId}/reopen`)
      .then((r) => r.data.version),
  generateNotes: (projectId: string, versionId: string, overwrite = true) =>
    http
      .post<VersionDetail>(`/projects/${projectId}/versions/${versionId}/release-notes`, { overwrite })
      .then((r) => r.data),
  remove: (projectId: string, versionId: string) => http.delete(`/projects/${projectId}/versions/${versionId}`),
}
