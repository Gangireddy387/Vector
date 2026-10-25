import type { RouteRecordRaw } from 'vue-router'

export const notificationRoutes: RouteRecordRaw[] = [
  { path: 'inbox', name: 'inbox', component: () => import('./pages/InboxPage.vue'), meta: { title: 'Inbox' } },
]
