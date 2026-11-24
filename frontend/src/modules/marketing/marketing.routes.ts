import type { RouteRecordRaw } from 'vue-router'

/** Public marketing / viral surfaces — no auth required. */
export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: '/about',
    name: 'landing',
    component: () => import('./pages/LandingPage.vue'),
    meta: { title: 'Vector' },
  },
  {
    path: '/pricing',
    name: 'pricing',
    component: () => import('./pages/PricingPage.vue'),
    meta: { title: 'Pricing' },
  },
  {
    path: '/workday',
    name: 'workday-preview',
    component: () => import('./pages/WorkdayPreviewPage.vue'),
    meta: { title: 'Workday' },
  },
  {
    path: '/preview',
    redirect: { name: 'workday-preview' },
  },
  /** Old viral invite URLs → public workday preview (membership still needs a real invite). */
  {
    path: '/invite/:slug',
    redirect: (to) => ({ name: 'workday-preview', query: { org: String(to.params.slug ?? '') } }),
  },
]
