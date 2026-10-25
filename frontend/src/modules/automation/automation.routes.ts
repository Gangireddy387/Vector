import type { RouteRecordRaw } from 'vue-router'

export const automationRoutes: RouteRecordRaw[] = [
  {
    path: 'automation',
    name: 'project-automation',
    component: () => import('./pages/AutomationPage.vue'),
    meta: { title: 'Automation' },
  },
]
