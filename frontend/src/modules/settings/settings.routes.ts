import type { RouteRecordRaw } from 'vue-router'

export const settingsRoutes: RouteRecordRaw[] = [
  { path: 'settings', name: 'settings', component: () => import('./pages/AccountSettingsPage.vue'), meta: { title: 'Settings' } },
  { path: 'more', name: 'more', component: () => import('./pages/MobileMenuPage.vue'), meta: { title: 'More' } },
]
