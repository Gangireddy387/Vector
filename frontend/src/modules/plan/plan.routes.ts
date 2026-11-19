import type { RouteRecordRaw } from 'vue-router'

export const planRoutes: RouteRecordRaw[] = [
  {
    path: 'plan',
    name: 'org-plan',
    component: () => import('./pages/OrgPlanPage.vue'),
    meta: { title: 'Plan', mobileBack: true },
  },
]
