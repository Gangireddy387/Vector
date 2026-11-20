import type { RouteRecordRaw } from 'vue-router'

/** Public request forms: submit work without a Vector account. */
export const publicIntakeRoutes: RouteRecordRaw[] = [
  { path: '/request/:token', name: 'public-intake', component: () => import('./pages/PublicIntakePage.vue'), props: true, meta: { title: 'Submit a request' } },
]
