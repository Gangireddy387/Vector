import type { RouteRecordRaw } from 'vue-router'

export const dashboardRoutes: RouteRecordRaw[] = [
  { path: '', name: 'home', component: () => import('./pages/HomePage.vue'), meta: { title: 'Home' } },
  {
    path: 'standup-rollup',
    name: 'standup-rollup',
    component: () => import('@/modules/standup/pages/StandupRollupPage.vue'),
    meta: { title: 'Standup rollup', requiresFeature: ['chat'], mobileBack: true, fillHeight: true },
  },
]
