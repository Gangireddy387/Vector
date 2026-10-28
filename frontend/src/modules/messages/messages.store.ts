import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSocket } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type ChatMessage, type ConversationSummary, messagesApi } from './messages.api'

/** The conversation list and unread counts, kept live so the sidebar badge and the Messages page agree. */
export const useMessagesStore = defineStore('messages', () => {
  const auth = useAuthStore()
  const conversations = ref<ConversationSummary[] | null>(null)
  /** The conversation open on screen; its new messages are read right away, so they never count as unread. */
  const openId = ref<string | null>(null)
  let isBound = false

  const isAvailable = computed(() => auth.hasFeature('directMessages') || auth.hasFeature('teamChat'))
  const unreadTotal = computed(() => (conversations.value ?? []).reduce((total, conversation) => total + conversation.unread, 0))

  async function load() {
    if (!isAvailable.value) return (conversations.value = [])
    conversations.value = await messagesApi.list()
  }

  function upsert(summary: ConversationSummary) {
    const list = (conversations.value ?? []).filter((conversation) => conversation.id !== summary.id)
    conversations.value = [summary, ...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  function onMessage(message: ChatMessage) {
    const conversation = conversations.value?.find((item) => item.id === message.conversationId)
    if (!conversation) return void load()
    const isMine = message.authorId === auth.user?.id
    upsert({
      ...conversation,
      lastMessage: { body: message.body, deleted: false, createdAt: message.createdAt, author: message.author },
      updatedAt: message.createdAt,
      unread: isMine || openId.value === conversation.id ? conversation.unread : conversation.unread + 1,
    })
  }

  function markReadLocally(conversationId: string) {
    const conversation = conversations.value?.find((item) => item.id === conversationId)
    if (conversation) conversation.unread = 0
  }

  function bindRealtime() {
    const socket = getSocket()
    if (!socket || isBound) return
    isBound = true
    socket.on('conversation:message', onMessage)
    socket.on('conversation:read', (event: { conversationId: string; userId: string }) => {
      if (event.userId === auth.user?.id) markReadLocally(event.conversationId)
    })
  }

  return { conversations, openId, isAvailable, unreadTotal, load, upsert, markReadLocally, bindRealtime }
})
