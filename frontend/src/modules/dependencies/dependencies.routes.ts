import type { RouteRecordRaw } from 'vue-router'

export const dependencyRoutes: RouteRecordRaw[] = [
  {
    path: 'dependencies',
    name: 'project-dependencies',
    component: () => import('./pages/DependenciesPage.vue'),
    meta: { title: 'Dependencies', fillHeight: true },
  },
]
