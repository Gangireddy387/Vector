import type { RouteRecordRaw } from 'vue-router'

/** Direct messages and team/department chats (each part needs its plan feature). */
export const messageRoutes: RouteRecordRaw[] = [
  {
    path: 'messages/:conversationId?',
    name: 'messages',
    component: () => import('./pages/MessagesPage.vue'),
    props: true,
    meta: { title: 'Messages', requiresFeature: ['directMessages', 'teamChat'] },
  },
]
