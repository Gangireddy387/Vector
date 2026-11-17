import { http } from '@/lib/http'
import type { AppNotification } from '@/types/models'

export interface NotificationListParams {
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export const notificationsApi = {
  list: (params: NotificationListParams | boolean = {}) => {
    const query = typeof params === 'boolean' ? { unreadOnly: params } : params
    return http
      .get<{ notifications: AppNotification[]; total: number }>('/notifications', {
        params: {
          unreadOnly: query.unreadOnly ? 'true' : undefined,
          limit: query.limit,
          offset: query.offset,
        },
      })
      .then((r) => r.data)
  },
  unreadCount: () => http.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
  markRead: (notificationId: string, options?: { clicked?: boolean }) =>
    http.patch(`/notifications/${notificationId}/read`, options?.clicked ? { clicked: true } : {}),
  markAllRead: () => http.post('/notifications/read-all'),
  remove: (notificationId: string) => http.delete(`/notifications/${notificationId}`),
}
