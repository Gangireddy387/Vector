import type { RouteRecordRaw } from 'vue-router'

export const releaseRoutes: RouteRecordRaw[] = [
  {
    path: 'releases',
    name: 'project-releases',
    component: () => import('./pages/ReleasesPage.vue'),
    meta: { title: 'Releases', requiresFeature: ['releases'], fillHeight: true },
  },
  {
    path: 'releases/:versionId',
    name: 'project-release',
    component: () => import('./pages/ReleaseDetailPage.vue'),
    meta: { title: 'Release', requiresFeature: ['releases'], fillHeight: true },
  },
]
