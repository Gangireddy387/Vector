import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export interface WikiPage {
  id: string
  title: string
  body: string
  createdById: string | null
  updatedById: string | null
  createdBy: UserSummary | null
  updatedBy: UserSummary | null
  createdAt: string
  updatedAt: string
}

export const wikiApi = {
  list: () => http.get<{ pages: WikiPage[] }>('/wiki/pages').then((r) => r.data.pages),
  get: (pageId: string) => http.get<{ page: WikiPage }>(`/wiki/pages/${pageId}`).then((r) => r.data.page),
  create: (payload: { title: string; body?: string }) =>
    http.post<{ page: WikiPage }>('/wiki/pages', payload).then((r) => r.data.page),
  update: (pageId: string, payload: { title?: string; body?: string }) =>
    http.patch<{ page: WikiPage }>(`/wiki/pages/${pageId}`, payload).then((r) => r.data.page),
  remove: (pageId: string) => http.delete(`/wiki/pages/${pageId}`),
}
