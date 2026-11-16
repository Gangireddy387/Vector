import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { bindSocketEvents } from '@/lib/socket-events'
import { playSound } from '@/lib/sounds'
import type { AppNotification } from '@/types/models'
import { notificationsApi } from './notifications.api'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const isLoading = ref(false)
  /** Why the inbox list could not load (shown with retry), or null. */
  const loadError = ref<string | null>(null)
  let unbind: (() => void) | null = null

  async function fetchNotifications() {
    isLoading.value = true
    loadError.value = null
    try {
      items.value = await notificationsApi.list()
      unreadCount.value = items.value.filter((item) => !item.readAt).length
    } catch (problem) {
      loadError.value = getErrorMessage(problem)
      throw problem
    } finally {
      isLoading.value = false
    }
  }

  async function refreshUnreadCount() {
    unreadCount.value = await notificationsApi.unreadCount()
  }

  async function markRead(notification: AppNotification, options?: { clicked?: boolean }) {
    const clicked = Boolean(options?.clicked)
    if (notification.readAt && (!clicked || notification.clickedAt)) return
    if (!notification.readAt) {
      notification.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    if (clicked) notification.clickedAt = notification.clickedAt ?? new Date().toISOString()
    await notificationsApi.markRead(notification.id, { clicked })
  }

  /** Open / navigate — counts as a real click for nudge open-rate. */
  async function openNotification(notification: AppNotification) {
    await markRead(notification, { clicked: true })
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
          playSound('notification', { id: notification.id })
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
    loadError.value = null
    unbind?.()
    unbind = null
  }

  return {
    items,
    unreadCount,
    isLoading,
    loadError,
    fetchNotifications,
    refreshUnreadCount,
    markRead,
    openNotification,
    markAllRead,
    remove,
    bindRealtime,
    reset,
  }
})
