import type { RouteRecordRaw } from 'vue-router'

/** Public pages, reachable signed in or out (linked from sign-in, registration and emails). */
export const legalRoutes: RouteRecordRaw[] = [
  { path: '/privacy', name: 'privacy', component: () => import('./pages/PrivacyPolicyPage.vue'), meta: { title: 'Privacy Policy' } },
  { path: '/terms', name: 'terms', component: () => import('./pages/TermsPage.vue'), meta: { title: 'Terms of Service' } },
]
