import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

/** A message between the portal's super admin and an organization's admins. */
export interface SupportMessage {
  id: string
  organizationId: string
  authorId: string | null
  author: UserSummary | null
  /** Written by the super admin (Vector team) rather than the organization. */
  fromPortal: boolean
  /** `system` notices (such as disappearing messages turned on) show as a centred note. */
  kind: 'message' | 'system'
  body: string
  readAt: string | null
  /** Deleted for everyone by its author. */
  deletedAt: string | null
  /** Disappearing message: gone after this moment. */
  expiresAt: string | null
  createdAt: string
}

/** Disappearing-message timer in hours, or null when messages are kept. */
export type DisappearHours = 24 | 168 | null

export interface SupportThread {
  messages: SupportMessage[]
  unread: number
  disappearHours: DisappearHours
}

const thread = (request: Promise<{ data: SupportThread }>) => request.then((r) => r.data)
const sent = (request: Promise<{ data: { message: SupportMessage } }>) => request.then((r) => r.data.message)

/** The super admin's side: one conversation per organization. */
export const portalSupportApi = {
  unread: () => http.get<{ unread: Record<string, number> }>('/super-admin/support/unread').then((r) => r.data.unread),
  thread: (organizationId: string) => thread(http.get(`/super-admin/organizations/${organizationId}/support`)),
  send: (organizationId: string, body: string) => sent(http.post(`/super-admin/organizations/${organizationId}/support`, { body })),
  markRead: (organizationId: string) => http.post(`/super-admin/organizations/${organizationId}/support/read`),
  remove: (organizationId: string, messageId: string) => sent(http.delete(`/super-admin/organizations/${organizationId}/support/messages/${messageId}`)),
  setDisappearing: (organizationId: string, hours: DisappearHours) => thread(http.put(`/super-admin/organizations/${organizationId}/support/disappearing`, { hours })),
}

/** The organization admins' side of their conversation with the Vector team. */
export const organizationSupportApi = {
  thread: () => thread(http.get('/workspace/support')),
  send: (body: string) => sent(http.post('/workspace/support', { body })),
  markRead: () => http.post('/workspace/support/read'),
  remove: (messageId: string) => sent(http.delete(`/workspace/support/messages/${messageId}`)),
  setDisappearing: (hours: DisappearHours) => thread(http.put('/workspace/support/disappearing', { hours })),
}
