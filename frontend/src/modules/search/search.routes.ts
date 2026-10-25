import type { RouteRecordRaw } from 'vue-router'

export const searchRoutes: RouteRecordRaw[] = [
  { path: 'search', name: 'search', component: () => import('./pages/SearchPage.vue'), meta: { title: 'Search', mobileBack: true } },
]
