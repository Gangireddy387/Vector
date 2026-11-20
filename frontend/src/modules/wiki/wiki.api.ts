import { http } from '@/lib/http'
import type { AiSource } from '@/modules/issues/api/ai.api'
import type { UserSummary } from '@/types/models'

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
  create: (payload: { title?: string; body?: string; templateId?: string }) =>
    http.post<{ page: WikiPage }>('/wiki/pages', payload).then((r) => r.data.page),
  generate: (payload: { kind: WikiAiKind; brief?: string; title?: string }) =>
    http.post<{ page: WikiPage; source: AiSource }>('/wiki/ai/generate', payload).then((r) => r.data),
  fill: (pageId: string, payload?: { brief?: string }) =>
    http.post<{ page: WikiPage; source: AiSource }>(`/wiki/pages/${pageId}/ai/fill`, payload ?? {}).then((r) => r.data),
  update: (pageId: string, payload: { title?: string; body?: string }) =>
    http.patch<{ page: WikiPage }>(`/wiki/pages/${pageId}`, payload).then((r) => r.data.page),
  remove: (pageId: string) => http.delete(`/wiki/pages/${pageId}`),
}
