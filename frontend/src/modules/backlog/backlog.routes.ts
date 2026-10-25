import type { RouteRecordRaw } from 'vue-router'

export const backlogRoutes: RouteRecordRaw[] = [
  { path: 'backlog', name: 'project-backlog', component: () => import('./pages/BacklogPage.vue'), meta: { title: 'Backlog' } },
]
