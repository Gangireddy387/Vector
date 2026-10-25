import type { RouteRecordRaw } from 'vue-router'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: 'admin/workspace',
    name: 'workspace-admin',
    component: () => import('./pages/WorkspaceAdminPage.vue'),
    meta: { title: 'Organization settings', requiresWorkspaceAdmin: true, mobileBack: true },
  },
]
