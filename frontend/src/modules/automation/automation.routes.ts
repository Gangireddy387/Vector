import type { RouteRecordRaw } from 'vue-router'
import { AUTOMATION_FEATURES } from '@/components/layout/projectNavigation'

export const automationRoutes: RouteRecordRaw[] = [
  {
    path: 'automation',
    name: 'project-automation',
    component: () => import('./pages/AutomationPage.vue'),
    meta: { title: 'Automation', requiresFeature: AUTOMATION_FEATURES },
  },
]
