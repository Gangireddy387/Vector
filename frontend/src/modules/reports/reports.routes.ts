import type { RouteRecordRaw } from 'vue-router'

/** Project tab: the report pinned to the current project. */
export const reportRoutes: RouteRecordRaw[] = [
  { path: 'progress', name: 'project-progress', component: () => import('./pages/ProjectProgressPage.vue'), meta: { title: 'Progress' } },
  { path: 'reports', name: 'project-reports', component: () => import('./pages/ReportsPage.vue'), meta: { title: 'Reports' } },
]

/** Workspace-wide report with a project filter. */
export const globalReportRoutes: RouteRecordRaw[] = [
  { path: 'reports', name: 'reports', component: () => import('./pages/ReportsPage.vue'), meta: { title: 'Reports' } },
]
