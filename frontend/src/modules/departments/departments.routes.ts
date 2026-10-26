import type { RouteRecordRaw } from 'vue-router'

const meta = { requiresWorkspaceAdmin: true, mobileBack: true }

/** Organization structure pages (organization admins): departments → teams → members. */
export const departmentRoutes: RouteRecordRaw[] = [
  { path: 'admin/departments', name: 'departments', component: () => import('./pages/DepartmentListPage.vue'), meta: { ...meta, title: 'Departments' } },
  {
    path: 'admin/departments/new',
    name: 'department-create',
    component: () => import('./pages/DepartmentFormPage.vue'),
    meta: { ...meta, title: 'New department', hideMobileTabBar: true },
  },
  {
    path: 'admin/departments/:departmentId',
    name: 'department',
    component: () => import('./pages/DepartmentDetailPage.vue'),
    props: true,
    meta: { ...meta, title: 'Department' },
  },
  {
    path: 'admin/departments/:departmentId/edit',
    name: 'department-edit',
    component: () => import('./pages/DepartmentFormPage.vue'),
    props: true,
    meta: { ...meta, title: 'Edit department', hideMobileTabBar: true },
  },
  {
    path: 'admin/departments/:departmentId/teams/new',
    name: 'team-create',
    component: () => import('./pages/TeamFormPage.vue'),
    props: true,
    meta: { ...meta, title: 'New team', hideMobileTabBar: true },
  },
  { path: 'admin/teams/:teamId', name: 'team', component: () => import('./pages/TeamDetailPage.vue'), props: true, meta: { ...meta, title: 'Team' } },
  {
    path: 'admin/teams/:teamId/edit',
    name: 'team-edit',
    component: () => import('./pages/TeamFormPage.vue'),
    props: true,
    meta: { ...meta, title: 'Edit team', hideMobileTabBar: true },
  },
]
