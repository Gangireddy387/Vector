import type { RouteRecordRaw } from 'vue-router'

export const roadmapRoutes: RouteRecordRaw[] = [
  {
    path: 'roadmap',
    name: 'project-roadmap',
    component: () => import('./pages/RoadmapPage.vue'),
    meta: { title: 'Roadmap', requiresFeature: ['roadmap'] },
  },
]
