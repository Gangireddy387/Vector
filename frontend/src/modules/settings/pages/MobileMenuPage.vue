<script setup lang="ts">
import { BarChart3, BookOpen, Building2, CalendarDays, Check, ChevronRight, ClipboardList, Crown, Download, FolderKanban, Gem, LayoutGrid, ListTodo, LogOut, Plus, Search, Settings, ShieldCheck, Target, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import PageFrame from '@/components/common/PageFrame.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useDevice } from '@/composables/useDevice'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'

const auth = useAuthStore()
const projects = useProjectsStore()
const { canInstall, install } = usePwaInstall()
const { isStandalone } = useDevice()
const showAppleInstallHint = computed(
  () =>
    !isStandalone &&
    !canInstall.value &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    /Safari/.test(navigator.userAgent),
)

async function signOut() {
  await auth.logout()
}

function teaser(feature: string, on: boolean, name: string, label: string, icon: typeof BarChart3) {
  return {
    to: on ? { name } : { name: 'feature-locked', query: { feature } },
    label: on ? label : `${label} (Pro)`,
    icon,
  }
}

const LINKS = computed(() => [
  { to: { name: 'issues' }, label: 'Tasks', icon: ListTodo },
  teaser('reports', auth.hasFeature('reports'), 'reports', 'Reports', BarChart3),
  teaser('goals', auth.hasFeature('goals'), 'goals', 'Goals', Target),
  teaser('portfolio', auth.hasFeature('portfolio'), 'portfolio', 'Portfolio', LayoutGrid),
  teaser('wiki', auth.hasFeature('wiki'), 'wiki', 'Wiki', BookOpen),
  { to: { name: 'search' }, label: 'Search', icon: Search },
  { to: { name: 'settings' }, label: 'Settings', icon: Settings },
  { to: { name: 'org-plan' }, label: 'Plan', icon: Gem },
  { to: { name: 'departments' }, label: 'Departments', icon: Building2 },
  teaser('calendar', auth.hasFeature('calendar'), 'calendar', 'Calendar', CalendarDays),
  ...(auth.hasFeature('chat') && projects.joinedProjects.some((project) => project.myRole === 'admin' || project.leadId === auth.user?.id)
    ? [{ to: { name: 'standup-rollup' }, label: 'Standup rollup', icon: ClipboardList }]
    : []),
  // Messages lives on the tab bar when available; keep Projects easy to reach from More.
  { to: { name: 'projects' }, label: 'Projects', icon: FolderKanban },
  teaser('meetings', auth.hasFeature('meetings'), 'meetings', 'Meetings', Video),
  ...(auth.isOrganizationAdmin ? [{ to: { name: 'workspace-admin' }, label: 'Organization settings', icon: ShieldCheck }] : []),
  ...(auth.isSuperAdmin ? [{ to: { name: 'super-admin' }, label: 'Super admin', icon: Crown }] : []),
])

const openOrganization = (organizationId: string) => organizationId !== auth.organization?.id && auth.switchOrganization(organizationId)

const itemClass =
  'flex items-center gap-3 border-b border-border/60 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/25 active:bg-muted'
</script>

<template>
  <PageFrame gap="default" pad="compact" tab-clearance>
    <RouterLink
      :to="{ name: 'settings' }"
      class="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 active:bg-muted"
    >
      <UserAvatar :user="auth.user" size="lg" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">{{ auth.user?.name }}</p>
        <p class="truncate text-sm text-muted-foreground">{{ auth.user?.email }}</p>
      </div>
      <ChevronRight class="size-4 text-muted-foreground" />
    </RouterLink>

    <nav class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft" aria-label="More">
      <RouterLink v-for="link in LINKS" :key="link.label" :to="link.to" :class="itemClass">
        <component :is="link.icon" class="size-5 text-muted-foreground" />
        <span class="flex-1">{{ link.label }}</span>
        <ChevronRight class="size-4 text-muted-foreground" />
      </RouterLink>
      <button v-if="canInstall" type="button" :class="[itemClass, 'w-full border-t text-left']" @click="install">
        <Download class="size-5 text-muted-foreground" />
        <span class="flex-1">Install app</span>
      </button>
      <p v-else-if="showAppleInstallHint" class="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
        Install Vector: Share → <span class="font-medium text-foreground">Add to Home Screen</span>
      </p>
    </nav>

    <section class="space-y-2">
      <h2 class="px-1 text-xs font-medium text-muted-foreground">Organizations</h2>
      <nav class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft" aria-label="Organizations">
        <button
          v-for="organization in auth.organizations"
          :key="organization.id"
          type="button"
          :class="[itemClass, 'w-full text-left']"
          :aria-current="organization.id === auth.organization?.id ? 'true' : undefined"
          @click="openOrganization(organization.id)"
        >
          <Building2 class="size-5 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block truncate">{{ organization.name }}</span>
            <span class="block truncate text-xs text-muted-foreground">/{{ organization.slug }} · {{ organization.role === 'admin' ? 'Admin' : 'Member' }}</span>
          </span>
          <Check v-if="organization.id === auth.organization?.id" class="size-4 text-primary" />
        </button>
        <RouterLink
          v-if="auth.canCreateOrganization"
          :to="{ name: 'organization-create' }"
          :class="[itemClass, 'border-t text-primary']"
        >
          <Plus class="size-5" /> <span class="flex-1">Create organization</span>
        </RouterLink>
      </nav>
    </section>

    <section class="space-y-2">
      <h2 class="px-1 text-xs font-medium text-muted-foreground">Projects</h2>
      <nav class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft" aria-label="Projects">
        <template v-if="projects.joinedProjects.length">
          <RouterLink
            v-for="project in projects.joinedProjects"
            :key="project.id"
            :to="{ name: 'project-board', params: { projectId: project.id } }"
            :class="itemClass"
          >
            <span class="size-3 shrink-0 rounded-sm" :style="{ backgroundColor: project.color }" />
            <span class="flex-1 truncate">{{ project.name }}</span>
            <span class="text-xs text-muted-foreground">{{ project.issueSummary?.open ?? 0 }} open</span>
          </RouterLink>
        </template>
        <div v-else class="space-y-2 px-4 py-3.5 text-sm text-muted-foreground">
          <p>You’re not on a project yet.</p>
          <div class="flex flex-wrap gap-2">
            <RouterLink :to="{ name: 'projects' }" class="font-medium text-primary hover:underline">Browse projects</RouterLink>
          </div>
        </div>
      </nav>
    </section>

    <button
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-card py-3.5 font-medium text-destructive shadow-soft transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 active:bg-muted"
      @click="signOut"
    >
      <LogOut class="size-5" /> Sign out
    </button>
  </PageFrame>
</template>
