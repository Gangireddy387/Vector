import { format, isToday, isYesterday, parseISO } from 'date-fns'
import type { ConversationSummary } from '../messages.api'

/** Short timestamp for the conversation list (today = clock, yesterday = label). */
export function listTime(value: string) {
  const date = parseISO(value)
  return isToday(date) ? format(date, 'HH:mm') : isYesterday(date) ? 'Yesterday' : format(date, 'd/M/yy')
}

/** One-line preview under the conversation title. */
export function conversationPreview(conversation: ConversationSummary, myUserId?: string | null) {
  const last = conversation.lastMessage
  if (!last) return 'Say hello'
  if (last.deleted) return 'This message was deleted'
  return last.author?.id === myUserId ? `You: ${last.body}` : last.body
}

export function conversationMatches(conversation: ConversationSummary, term: string) {
  const needle = term.trim().toLowerCase()
  return !needle || `${conversation.title} ${conversation.subtitle} ${conversation.team?.name ?? ''}`.toLowerCase().includes(needle)
}
