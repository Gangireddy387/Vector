import type { RouteRecordRaw } from 'vue-router'

/** Standalone (outside the app shell): the super admin does not need to belong to any organization. */
export const superAdminRoutes: RouteRecordRaw[] = [
  {
    path: '/super-admin',
    alias: '/superadmin',
    name: 'super-admin',
    component: () => import('./pages/SuperAdminPage.vue'),
    meta: { requiresAuth: true, allowWithoutOrganization: true, requiresSuperAdmin: true, title: 'Super admin' },
  },
  /** A video call with an organization's admins (under /super-admin so it uses the super admin's sign-in). */
  {
    path: '/super-admin/call/:meetingId',
    name: 'super-admin-call',
    component: () => import('@/modules/support/pages/SupportCallPage.vue'),
    props: true,
    meta: { requiresAuth: true, allowWithoutOrganization: true, requiresSuperAdmin: true, title: 'Support call' },
  },
]
