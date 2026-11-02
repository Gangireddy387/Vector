import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { bindSocketEvents } from '@/lib/socket-events'
import type { AppNotification } from '@/types/models'
import { notificationsApi } from './notifications.api'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const isLoading = ref(false)
  let unbind: (() => void) | null = null

  async function fetchNotifications() {
    isLoading.value = true
    try {
      items.value = await notificationsApi.list()
      unreadCount.value = items.value.filter((item) => !item.readAt).length
    } finally {
      isLoading.value = false
    }
  }

  async function refreshUnreadCount() {
    unreadCount.value = await notificationsApi.unreadCount()
  }

  async function markRead(notification: AppNotification) {
    if (notification.readAt) return
    notification.readAt = new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    await notificationsApi.markRead(notification.id)
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    items.value.forEach((item) => (item.readAt ??= now))
    unreadCount.value = 0
    await notificationsApi.markAllRead()
  }

  async function remove(notification: AppNotification) {
    items.value = items.value.filter((item) => item.id !== notification.id)
    if (!notification.readAt) unreadCount.value = Math.max(0, unreadCount.value - 1)
    await notificationsApi.remove(notification.id)
  }

  /**
   * Subscribes to live notifications once per session and surfaces them as toasts. Follows the connection when it is
   * replaced, and catches up after reconnecting (notifications sent while offline).
   */
  function bindRealtime(onOpen: (notification: AppNotification) => void) {
    if (unbind) return
    let connectedBefore = false
    unbind = bindSocketEvents(
      {
        'notification:created': (notification: AppNotification) => {
          items.value.unshift(notification)
          unreadCount.value += 1
          toast(notification.title, {
            description: notification.body ?? undefined,
            action: notification.link ? { label: 'Open', onClick: () => onOpen(notification) } : undefined,
          })
        },
        // Notifications cleared elsewhere (e.g. by opening the chat they point to) leave the unread badge right away.
        'notifications:read': ({ ids, readAt }: { ids: string[]; readAt: string }) => {
          const cleared = new Set(ids)
          items.value.forEach((item) => {
            if (cleared.has(item.id)) item.readAt ??= readAt
          })
          void refreshUnreadCount()
        },
      },
      {
        onConnect: () => {
          if (connectedBefore) void fetchNotifications().catch(() => undefined)
          connectedBefore = true
        },
      },
    )
  }

  function reset() {
    items.value = []
    unreadCount.value = 0
    unbind?.()
    unbind = null
  }

  return { items, unreadCount, isLoading, fetchNotifications, refreshUnreadCount, markRead, markAllRead, remove, bindRealtime, reset }
})
