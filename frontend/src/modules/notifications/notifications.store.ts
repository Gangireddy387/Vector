import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { bindSocketEvents } from '@/lib/socket-events'
import { playSound } from '@/lib/sounds'
import type { AppNotification } from '@/types/models'
import { notificationsApi } from './notifications.api'

const PAGE_SIZE = 50

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const total = ref(0)
  const unreadCount = ref(0)
  const isLoading = ref(false)
  const isLoadingOlder = ref(false)
  /** Why the inbox list could not load (shown with retry), or null. */
  const loadError = ref<string | null>(null)
  let unbind: (() => void) | null = null

  const hasMore = computed(() => items.value.length < total.value)

  async function fetchNotifications() {
    isLoading.value = true
    loadError.value = null
    try {
      const result = await notificationsApi.list({ limit: PAGE_SIZE, offset: 0 })
      items.value = result.notifications
      total.value = result.total
      unreadCount.value = items.value.filter((item) => !item.readAt).length
      void refreshUnreadCount()
    } catch (problem) {
      loadError.value = getErrorMessage(problem)
      throw problem
    } finally {
      isLoading.value = false
    }
  }

  async function loadOlder() {
    if (!hasMore.value || isLoadingOlder.value || isLoading.value) return
    isLoadingOlder.value = true
    try {
      const result = await notificationsApi.list({ limit: PAGE_SIZE, offset: items.value.length })
      const seen = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...result.notifications.filter((item) => !seen.has(item.id))]
      total.value = result.total
    } catch (problem) {
      toast.error(getErrorMessage(problem))
    } finally {
      isLoadingOlder.value = false
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
    total.value = Math.max(0, total.value - 1)
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
          if (!items.value.some((item) => item.id === notification.id)) {
            items.value.unshift(notification)
            total.value += 1
          }
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
    total.value = 0
    unreadCount.value = 0
    loadError.value = null
    unbind?.()
    unbind = null
  }

  return {
    items,
    total,
    hasMore,
    unreadCount,
    isLoading,
    isLoadingOlder,
    loadError,
    fetchNotifications,
    loadOlder,
    refreshUnreadCount,
    markRead,
    openNotification,
    markAllRead,
    remove,
    bindRealtime,
    reset,
  }
})
