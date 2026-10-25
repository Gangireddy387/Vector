import type { RouteRecordRaw } from 'vue-router'

export const projectRoutes: RouteRecordRaw[] = [
  { path: 'projects', name: 'projects', component: () => import('./pages/ProjectListPage.vue'), meta: { title: 'Projects' } },
]

export const projectSettingsRoutes: RouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'project-settings',
    component: () => import('./pages/ProjectSettingsPage.vue'),
    meta: { title: 'Project settings', mobileBack: true },
  },
]
