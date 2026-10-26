import type { RouteRecordRaw } from 'vue-router'

/** Everyone's own day planner. */
export const calendarRoutes: RouteRecordRaw[] = [
  { path: 'calendar', name: 'calendar', component: () => import('./pages/CalendarPage.vue'), meta: { title: 'Calendar', mobileBack: true } },
]
