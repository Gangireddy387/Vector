import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { toast } from 'vue-sonner'
import { adminRoutes } from '@/modules/admin/admin.routes'
import { authRoutes } from '@/modules/auth/auth.routes'
import { automationRoutes } from '@/modules/automation/automation.routes'
import { backlogRoutes } from '@/modules/backlog/backlog.routes'
import { boardRoutes } from '@/modules/board/board.routes'
import { collaborationRoutes } from '@/modules/chat/chat.routes'
import { dashboardRoutes } from '@/modules/dashboard/dashboard.routes'
import { issueRoutes, projectIssueRoutes } from '@/modules/issues/issues.routes'
import { legalRoutes } from '@/modules/legal/legal.routes'
import { notificationRoutes } from '@/modules/notifications/notifications.routes'
import { projectRoutes, projectSettingsRoutes } from '@/modules/projects/projects.routes'
import { globalReportRoutes, reportRoutes } from '@/modules/reports/reports.routes'
import { searchRoutes } from '@/modules/search/search.routes'
import { settingsRoutes } from '@/modules/settings/settings.routes'
import { organizationsApi } from '@/modules/auth/auth.api'
import { useAuthStore } from '@/modules/auth/auth.store'

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in user (inherited by children). */
    requiresAuth?: boolean
    /** Only for signed-out visitors (login, register...). */
    guestOnly?: boolean
    /** Title shown in the mobile top bar and the document title. */
    title?: string
    /** Shows a back button instead of the brand in the mobile top bar. */
    mobileBack?: boolean
    /** Full-screen task pages (forms) on mobile: the bottom tab bar is hidden. */
    hideMobileTabBar?: boolean
    /** Organization administration (settings, people). */
    requiresWorkspaceAdmin?: boolean
    /** Signed-in pages that work before the person belongs to any organization. */
    allowWithoutOrganization?: boolean
  }
}

/**
 * `example.com/acme/anything` opens "anything" inside the Acme organization, switching to it first when needed,
 * so links shared from one organization never open in another. App pages always win over this route
 * (static paths rank higher), and the server reserves every page name so no organization can take one.
 */
const organizationLinkRoute: RouteRecordRaw = {
  path: '/:slug([a-z0-9][a-z0-9-]{1,38}[a-z0-9])/:rest(.*)*',
  name: 'organization-link',
  component: () => import('@/layouts/NotFoundPage.vue'),
  meta: { requiresAuth: true, allowWithoutOrganization: true },
  beforeEnter: async (to) => {
    const auth = useAuthStore()
    const slug = String(to.params.slug).toLowerCase()
    const rest = Array.isArray(to.params.rest) ? to.params.rest.join('/') : String(to.params.rest ?? '')
    const query = new URLSearchParams(Object.entries(to.query).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : []))).toString()
    const target = `/${rest}${query ? `?${query}` : ''}${to.hash}`
    const organization = auth.organizations.find((item) => item.slug === slug)
    if (!organization) {
      // A real organization the person is not part of gets an explanation; anything else is a plain "page not found".
      const exists = await organizationsApi.publicInfo(slug).then(() => true, () => false)
      if (!exists) return true
      toast.error(`You are not a member of “${slug}”`, { description: 'Ask one of its admins to invite you.' })
      return auth.organization ? { name: 'home' } : { name: 'organization-create' }
    }
    if (organization.id === auth.organization?.id) return target
    await auth.switchOrganization(organization.id, target)
    return false
  },
}

/** Organization links used to start with /o/; keep them working. */
const legacyOrganizationLinkRoute: RouteRecordRaw = {
  path: '/o/:slug/:rest(.*)*',
  redirect: (to) => {
    const rest = Array.isArray(to.params.rest) ? to.params.rest.join('/') : String(to.params.rest ?? '')
    return { path: `/${String(to.params.slug).toLowerCase()}${rest ? `/${rest}` : ''}`, query: to.query, hash: to.hash }
  },
}

const routes: RouteRecordRaw[] = [
  {
    path: '/account',
    component: () => import('@/layouts/AuthLayout.vue'),
    redirect: '/login',
    children: authRoutes,
  },
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      ...dashboardRoutes,
      ...projectRoutes,
      {
        path: 'projects/:projectId',
        component: () => import('@/modules/projects/pages/ProjectLayout.vue'),
        props: true,
        children: [
          { path: '', name: 'project', redirect: (to) => ({ name: 'project-board', params: to.params }) },
          ...boardRoutes,
          ...backlogRoutes,
          ...projectIssueRoutes,
          ...collaborationRoutes,
          ...reportRoutes,
          ...automationRoutes,
          ...projectSettingsRoutes,
        ],
      },
      ...issueRoutes,
      ...globalReportRoutes,
      ...notificationRoutes,
      ...searchRoutes,
      ...settingsRoutes,
      ...adminRoutes,
    ],
  },
  ...legalRoutes,
  legacyOrganizationLinkRoute,
  organizationLinkRoute,
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/layouts/NotFoundPage.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 80, behavior: 'smooth' }
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) return { name: 'home' }
  const needsOrganization = to.matched.some((record) => record.meta.requiresAuth) && !to.matched.some((record) => record.meta.allowWithoutOrganization)
  if (needsOrganization && auth.isAuthenticated && !auth.organization) return { name: 'organization-create' }
  if (to.meta.requiresWorkspaceAdmin && !auth.isOrganizationAdmin) return { name: 'home' }
  if (to.name === 'organization-create' && auth.isAuthenticated && !auth.canCreateOrganization) return { name: 'home' }
  return true
})

router.afterEach((to) => {
  const title = [...to.matched].reverse().find((record) => record.meta.title)?.meta.title
  document.title = title ? `${title} · Vector` : 'Vector'
})
