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
  /** When its author last changed the text. */
  editedAt: string | null
  createdAt: string
}

/** Disappearing-message timer in hours, or null when messages are kept. */
export type DisappearHours = 24 | 168 | null

export interface SupportThread {
  messages: SupportMessage[]
  unread: number
  disappearHours: DisappearHours
}

/** One side of one conversation. */
export interface SupportChatApi {
  thread: () => Promise<SupportThread>
  send: (body: string) => Promise<SupportMessage>
  /** Changes the text of one of this side's messages. */
  edit: (messageId: string, body: string) => Promise<SupportMessage>
  markRead: () => Promise<unknown>
  /** Deletes one of this side's messages for everyone. */
  remove: (messageId: string) => Promise<SupportMessage>
  /** Deletes any message for the signed-in person only. */
  hide: (messageId: string) => Promise<unknown>
  /** Empties the conversation for the signed-in person only. */
  clear: () => Promise<SupportThread>
  setDisappearing: (hours: DisappearHours) => Promise<SupportThread>
}

const thread = (request: Promise<{ data: SupportThread }>) => request.then((r) => r.data)
const sent = (request: Promise<{ data: { message: SupportMessage } }>) => request.then((r) => r.data.message)

/** The same endpoints on both sides, under a different base path. */
const chatAt = (base: string): SupportChatApi => ({
  thread: () => thread(http.get(base)),
  send: (body) => sent(http.post(base, { body })),
  edit: (messageId, body) => sent(http.patch(`${base}/messages/${messageId}`, { body })),
  markRead: () => http.post(`${base}/read`),
  remove: (messageId) => sent(http.delete(`${base}/messages/${messageId}`)),
  hide: (messageId) => http.post(`${base}/messages/${messageId}/hide`),
  clear: () => thread(http.post(`${base}/clear`)),
  setDisappearing: (hours) => thread(http.put(`${base}/disappearing`, { hours })),
})

/** The super admin's side: one conversation per organization. */
export const portalSupportApi = {
  unread: () => http.get<{ unread: Record<string, number> }>('/super-admin/support/unread').then((r) => r.data.unread),
  chat: (organizationId: string) => chatAt(`/super-admin/organizations/${organizationId}/support`),
}

/** The organization admins' side of their conversation with the Vector team. */
export const organizationSupportApi = chatAt('/workspace/support')
