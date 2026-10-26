import type { RouteRecordRaw } from 'vue-router'

/** Everyone can open the departments and teams they belong to (the server filters); only organization admins can change them. */
const viewMeta = { mobileBack: true }
const adminMeta = { requiresWorkspaceAdmin: true, mobileBack: true, hideMobileTabBar: true }

/** Organization structure pages: departments → teams → members. */
export const departmentRoutes: RouteRecordRaw[] = [
  { path: 'admin/departments', name: 'departments', component: () => import('./pages/DepartmentListPage.vue'), meta: { ...viewMeta, title: 'Departments' } },
  {
    path: 'admin/departments/new',
    name: 'department-create',
    component: () => import('./pages/DepartmentFormPage.vue'),
    meta: { ...adminMeta, title: 'New department' },
  },
  {
    path: 'admin/departments/:departmentId',
    name: 'department',
    component: () => import('./pages/DepartmentDetailPage.vue'),
    props: true,
    meta: { ...viewMeta, title: 'Department' },
  },
  {
    path: 'admin/departments/:departmentId/edit',
    name: 'department-edit',
    component: () => import('./pages/DepartmentFormPage.vue'),
    props: true,
    meta: { ...adminMeta, title: 'Edit department' },
  },
  {
    path: 'admin/departments/:departmentId/teams/new',
    name: 'team-create',
    component: () => import('./pages/TeamFormPage.vue'),
    props: true,
    meta: { ...adminMeta, title: 'New team' },
  },
  { path: 'admin/teams/:teamId', name: 'team', component: () => import('./pages/TeamDetailPage.vue'), props: true, meta: { ...viewMeta, title: 'Team' } },
  {
    path: 'admin/teams/:teamId/edit',
    name: 'team-edit',
    component: () => import('./pages/TeamFormPage.vue'),
    props: true,
    meta: { ...adminMeta, title: 'Edit team' },
  },
]
