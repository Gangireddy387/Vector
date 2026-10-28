import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export type ConversationKind = 'direct' | 'team' | 'department'

export interface ChatMessage {
  id: string
  conversationId: string
  authorId: string | null
  author: UserSummary | null
  body: string
  /** Deleted for everyone by its author. */
  deletedAt: string | null
  createdAt: string
}

/** A conversation as the list and the chat header show it. */
export interface ConversationSummary {
  id: string
  kind: ConversationKind
  title: string
  subtitle: string
  unread: number
  updatedAt: string
  lastMessage: { body: string; deleted: boolean; createdAt: string; author: UserSummary | null } | null
  /** Direct chats: the other person, with whether they have the app open. */
  person?: (UserSummary & { lastSeenAt: string | null; isOnline: boolean }) | null
  /** Direct chats: when the other person last read it (for read ticks). */
  otherLastReadAt?: string | null
  team?: { id: string; name: string } | null
  department?: { id: string; name: string } | null
  memberCount?: number
}

export const messagesApi = {
  list: () => http.get<{ conversations: ConversationSummary[] }>('/conversations').then((r) => r.data.conversations),
  openDirect: (userId: string) => http.post<{ conversation: ConversationSummary }>('/conversations/direct', { userId }).then((r) => r.data.conversation),
  get: (conversationId: string) =>
    http.get<{ conversation: ConversationSummary; messages: ChatMessage[] }>(`/conversations/${conversationId}`).then((r) => r.data),
  send: (conversationId: string, body: string) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages`, { body }).then((r) => r.data.message),
  markRead: (conversationId: string) => http.post(`/conversations/${conversationId}/read`),
  remove: (conversationId: string, messageId: string) =>
    http.delete<{ message: ChatMessage }>(`/conversations/${conversationId}/messages/${messageId}`).then((r) => r.data.message),
}
