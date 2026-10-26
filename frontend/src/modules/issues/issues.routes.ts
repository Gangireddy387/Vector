import type { RouteRecordRaw } from 'vue-router'

export const issueRoutes: RouteRecordRaw[] = [
  { path: 'issues', name: 'issues', component: () => import('./pages/IssueListPage.vue'), meta: { title: 'All tasks' } },
  {
    path: 'issues/new',
    name: 'issue-create',
    component: () => import('./pages/IssueCreatePage.vue'),
    meta: { title: 'Create task', mobileBack: true, hideMobileTabBar: true },
  },
  {
    path: 'issues/:issueKey',
    name: 'issue',
    component: () => import('./pages/IssueDetailPage.vue'),
    props: true,
    meta: { title: 'Task', mobileBack: true },
  },
]

export const projectIssueRoutes: RouteRecordRaw[] = [
  { path: 'issues', name: 'project-issues', component: () => import('./pages/IssueListPage.vue'), meta: { title: 'Tasks' } },
]
