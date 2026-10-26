import type { RouteRecordRaw } from 'vue-router'

/** Project tabs for talking about the work: the team chat and the daily standup. */
export const collaborationRoutes: RouteRecordRaw[] = [
  { path: 'chat', name: 'project-chat', component: () => import('./pages/ProjectChatPage.vue'), meta: { title: 'Chat', requiresFeature: ['chat'] } },
  {
    path: 'standup',
    name: 'project-standup',
    component: () => import('@/modules/standup/pages/StandupPage.vue'),
    meta: { title: 'Standup', requiresFeature: ['chat'] },
  },
]
