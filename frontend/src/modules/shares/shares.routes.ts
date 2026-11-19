import type { RouteRecordRaw } from 'vue-router'

/** Guest share links: read-only board or issue for people outside the organization. */
export const publicShareRoutes: RouteRecordRaw[] = [
  { path: '/share/:token', name: 'public-share', component: () => import('./pages/PublicSharePage.vue'), props: true, meta: { title: 'Shared view' } },
]
