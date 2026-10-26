import type { RouteRecordRaw } from 'vue-router'

export const authRoutes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue'), meta: { guestOnly: true, title: 'Sign in' } },
  {
    path: '/register',
    name: 'register',
    component: () => import('./pages/RegisterPage.vue'),
    meta: { guestOnly: true, title: 'Create account' },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./pages/ForgotPasswordPage.vue'),
    meta: { guestOnly: true, title: 'Forgot password' },
  },
  { path: '/reset-password', name: 'reset-password', component: () => import('./pages/ResetPasswordPage.vue'), meta: { title: 'Reset password' } },
  { path: '/accept-invite', name: 'accept-invite', component: () => import('./pages/AcceptInvitePage.vue'), meta: { title: 'Join your team' } },
  {
    path: '/organizations/new',
    name: 'organization-create',
    component: () => import('./pages/CreateOrganizationPage.vue'),
    meta: { requiresAuth: true, allowWithoutOrganization: true, title: 'Create organization' },
  },
  {
    path: '/pending-approval',
    name: 'organization-pending',
    component: () => import('./pages/OrganizationPendingPage.vue'),
    meta: { requiresAuth: true, allowWithoutOrganization: true, title: 'Waiting for approval' },
  },
]
