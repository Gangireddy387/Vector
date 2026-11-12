import type { RouteRecordRaw } from 'vue-router'

/** Organization admins' side of a video call with the Vector team (full screen, outside the app shell). */
export const supportCallRoutes: RouteRecordRaw[] = [
  {
    path: '/support-call/:meetingId',
    name: 'support-call',
    component: () => import('./pages/SupportCallPage.vue'),
    props: true,
    meta: { requiresAuth: true, title: 'Call with the Vector team' },
  },
]
