import type { RouteRecordRaw } from 'vue-router'

export const wikiRoutes: RouteRecordRaw[] = [
  {
    path: 'wiki',
    name: 'wiki',
    component: () => import('./pages/WikiPage.vue'),
    meta: { title: 'Wiki', requiresFeature: ['wiki'], fillHeight: true },
  },
  {
    path: 'wiki/:pageId',
    name: 'wiki-page',
    component: () => import('./pages/WikiPage.vue'),
    props: true,
    meta: { title: 'Wiki', requiresFeature: ['wiki'], fillHeight: true, mobileBack: true },
  },
]
