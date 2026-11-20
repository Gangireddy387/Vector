import { http } from '@/lib/http'
import type { AiSource } from '@/modules/issues/api/ai.api'
import type { UserSummary } from '@/types/models'

export type WikiKind = 'page' | 'folder'

export interface WikiReferencedIssue {
  id: string
  key: string
  title: string
  projectId: string
}

export interface WikiLinkedPage {
  id: string
  title: string
  excerpt?: string
}

export interface WikiPage {
  id: string
  title: string
  body?: string
  excerpt?: string
  parentId?: string | null
  kind?: WikiKind
  position?: number
  referencedIssues?: WikiReferencedIssue[]
  linkedPages?: WikiLinkedPage[]
  backlinks?: WikiLinkedPage[]
  createdById: string | null
  updatedById: string | null
  createdBy: UserSummary | null
  updatedBy: UserSummary | null
  createdAt: string
  updatedAt: string
}

export interface WikiPageRevision {
  id: string
  title: string
  body: string
  createdAt: string
  editor: UserSummary | null
}

export interface WikiTemplate {
  id: string
  title: string
  description: string
  audience?: string
  tips?: string[]
  pageTitle: string
}

export type WikiAiKind = 'handbook' | 'runbook' | 'meeting-notes' | 'faq' | 'project-brief' | 'how-to' | 'custom'

export const wikiApi = {
  list: (q?: string) =>
    http.get<{ pages: WikiPage[] }>('/wiki/pages', { params: q?.trim() ? { q: q.trim() } : undefined }).then((r) => r.data.pages),
  templates: () => http.get<{ templates: WikiTemplate[] }>('/wiki/templates').then((r) => r.data.templates),
  get: (pageId: string) => http.get<{ page: WikiPage }>(`/wiki/pages/${pageId}`).then((r) => r.data.page),
  create: (payload: { title?: string; body?: string; templateId?: string; parentId?: string | null; kind?: WikiKind }) =>
    http.post<{ page: WikiPage }>('/wiki/pages', payload).then((r) => r.data.page),
  generate: (payload: { kind: WikiAiKind; brief?: string; title?: string; parentId?: string | null }) =>
    http.post<{ page: WikiPage; source: AiSource }>('/wiki/ai/generate', payload).then((r) => r.data),
  fill: (pageId: string, payload?: { brief?: string }) =>
    http.post<{ page: WikiPage; source: AiSource }>(`/wiki/pages/${pageId}/ai/fill`, payload ?? {}).then((r) => r.data),
  update: (pageId: string, payload: { title?: string; body?: string; parentId?: string | null }) =>
    http.patch<{ page: WikiPage }>(`/wiki/pages/${pageId}`, payload).then((r) => r.data.page),
  history: (pageId: string) =>
    http.get<{ revisions: WikiPageRevision[] }>(`/wiki/pages/${pageId}/history`).then((r) => r.data.revisions),
  restore: (pageId: string, revisionId: string) =>
    http.post<{ page: WikiPage }>(`/wiki/pages/${pageId}/history/${revisionId}/restore`).then((r) => r.data.page),
  remove: (pageId: string) => http.delete(`/wiki/pages/${pageId}`),
  files: (pageId: string) => http.get<{ files: WikiFile[] }>(`/wiki/pages/${pageId}/files`).then((r) => r.data.files),
  uploadFile: (pageId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<{ file: WikiFile }>(`/wiki/pages/${pageId}/files`, form).then((r) => r.data.file)
  },
  fileLink: (pageId: string, fileId: string) =>
    http
      .get<{ url: string; absoluteUrl: string | null; thumbUrl: string | null; officeEmbedUrl: string | null }>(
        `/wiki/pages/${pageId}/files/${fileId}/link`,
      )
      .then((r) => r.data),
  removeFile: (pageId: string, fileId: string) => http.delete(`/wiki/pages/${pageId}/files/${fileId}`),
}

export interface WikiFile {
  id: string
  pageId: string
  fileName: string
  mimeType: string
  size: number
  hasThumb?: boolean
  createdAt: string
}
