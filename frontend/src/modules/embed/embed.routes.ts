import type { RouteRecordRaw } from 'vue-router'

/** Boots a partner embed session from a short-lived token, then enters the normal app shell. */
export const embedRoutes: RouteRecordRaw[] = [
  {
    path: '/embed',
    name: 'embed-boot',
    component: () => import('./pages/EmbedBootPage.vue'),
    meta: { title: 'Open workspace', guestOnly: false, allowWithoutOrganization: true },
  },
]
