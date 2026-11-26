import type { RouteRecordRaw } from 'vue-router'

export const helpRoutes: RouteRecordRaw[] = [
  {
    path: 'help',
    name: 'help',
    component: () => import('./pages/HelpGuidePage.vue'),
    meta: { title: 'Help & guide', mobileBack: true, fillHeight: true },
  },
]
