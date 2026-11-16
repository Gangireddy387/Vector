import type { RouteRecordRaw } from 'vue-router'

/** Public marketing / viral surfaces — no auth required. */
export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: '/workday',
    name: 'workday-preview',
    component: () => import('./pages/WorkdayPreviewPage.vue'),
    meta: { title: 'Workday' },
  },
  {
    path: '/preview',
    redirect: { name: 'workday-preview' },
  },
  {
    path: '/invite/:slug',
    name: 'invite-preview',
    component: () => import('./pages/InvitePreviewPage.vue'),
    meta: { title: 'Join workspace' },
  },
]
