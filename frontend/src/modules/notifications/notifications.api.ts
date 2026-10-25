import { http } from '@/lib/http'
import type { AppNotification } from '@/types/models'

export const notificationsApi = {
  list: (unreadOnly = false) =>
    http.get<{ notifications: AppNotification[] }>('/notifications', { params: { unreadOnly } }).then((r) => r.data.notifications),
  unreadCount: () => http.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
  markRead: (notificationId: string) => http.patch(`/notifications/${notificationId}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
  remove: (notificationId: string) => http.delete(`/notifications/${notificationId}`),
}
