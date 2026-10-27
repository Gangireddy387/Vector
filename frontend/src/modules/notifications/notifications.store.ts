import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { getSocket } from '@/lib/realtime'
import type { AppNotification } from '@/types/models'
import { notificationsApi } from './notifications.api'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const isLoading = ref(false)
  let isBound = false

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

  /** Subscribes to live notifications once per session and surfaces them as toasts. */
  function bindRealtime(onOpen: (notification: AppNotification) => void) {
    const socket = getSocket()
    if (!socket || isBound) return
    isBound = true
    socket.on('notification:created', (notification: AppNotification) => {
      items.value.unshift(notification)
      unreadCount.value += 1
      toast(notification.title, {
        description: notification.body ?? undefined,
        action: notification.link ? { label: 'Open', onClick: () => onOpen(notification) } : undefined,
      })
    })
    // Notifications cleared elsewhere (e.g. by opening the chat they point to) leave the unread badge right away.
    socket.on('notifications:read', ({ ids, readAt }: { ids: string[]; readAt: string }) => {
      const cleared = new Set(ids)
      items.value.forEach((item) => {
        if (cleared.has(item.id)) item.readAt ??= readAt
      })
      void refreshUnreadCount()
    })
  }

  function reset() {
    items.value = []
    unreadCount.value = 0
    isBound = false
  }

  return { items, unreadCount, isLoading, fetchNotifications, refreshUnreadCount, markRead, markAllRead, remove, bindRealtime, reset }
})
