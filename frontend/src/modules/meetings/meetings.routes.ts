import type { RouteRecordRaw } from 'vue-router'

/** Scheduled meetings and their browser video calls. */
export const meetingRoutes: RouteRecordRaw[] = [
  { path: 'meetings', name: 'meetings', component: () => import('./pages/MeetingsPage.vue'), meta: { title: 'Meetings', requiresFeature: ['meetings'], mobileBack: true } },
  {
    path: 'meetings/:meetingId',
    name: 'meeting-room',
    component: () => import('./pages/MeetingRoomPage.vue'),
    props: true,
    meta: { title: 'Meeting', requiresFeature: ['meetings'], mobileBack: true, hideMobileTabBar: true },
  },
]

/** Guest links: people outside the organization ask to join a call (no account needed). */
export const meetingGuestRoutes: RouteRecordRaw[] = [
  { path: '/join/:token', name: 'meeting-guest', component: () => import('./pages/GuestJoinPage.vue'), props: true, meta: { title: 'Join meeting' } },
]
