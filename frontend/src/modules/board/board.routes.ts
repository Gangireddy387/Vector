import type { RouteRecordRaw } from 'vue-router'

export const boardRoutes: RouteRecordRaw[] = [
  { path: 'board', name: 'project-board', component: () => import('./pages/BoardPage.vue'), meta: { title: 'Board' } },
]
