import type { RouteRecordRaw } from 'vue-router'

export const goalRoutes: RouteRecordRaw[] = [
  {
    path: 'goals',
    name: 'goals',
    component: () => import('./pages/GoalsPage.vue'),
    meta: { title: 'Goals', requiresFeature: ['goals'], fillHeight: true },
  },
  {
    path: 'goals/:goalId',
    name: 'goal',
    component: () => import('./pages/GoalDetailPage.vue'),
    props: true,
    meta: { title: 'Goal', requiresFeature: ['goals'], fillHeight: true, mobileBack: true },
  },
]
