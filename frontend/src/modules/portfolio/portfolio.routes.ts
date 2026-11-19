import type { RouteRecordRaw } from 'vue-router'

export const portfolioRoutes: RouteRecordRaw[] = [
  {
    path: 'portfolio',
    name: 'portfolio',
    component: () => import('./pages/PortfolioPage.vue'),
    meta: { title: 'Portfolio', requiresFeature: ['portfolio'], fillHeight: true },
  },
]
