<script setup lang="ts">
import { BarChart3, Building2, CalendarDays, Check, ChevronRight, Crown, Download, ListTodo, LogOut, Plus, Search, Settings, ShieldCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'

const auth = useAuthStore()
const projects = useProjectsStore()
const { canInstall, install } = usePwaInstall()

async function signOut() {
  await auth.logout()
}

const LINKS = computed(() => [
  { to: { name: 'issues' }, label: 'All tasks', icon: ListTodo },
  ...(auth.hasFeature('reports') ? [{ to: { name: 'reports' }, label: 'Reports', icon: BarChart3 }] : []),
  { to: { name: 'search' }, label: 'Search', icon: Search },
  { to: { name: 'settings' }, label: 'Settings', icon: Settings },
  { to: { name: 'departments' }, label: 'Departments', icon: Building2 },
  { to: { name: 'calendar' }, label: 'Calendar', icon: CalendarDays },
  ...(auth.isOrganizationAdmin ? [{ to: { name: 'workspace-admin' }, label: 'Organization settings', icon: ShieldCheck }] : []),
  ...(auth.isSuperAdmin ? [{ to: { name: 'super-admin' }, label: 'Super admin', icon: Crown }] : []),
])

const openOrganization = (organizationId: string) => organizationId !== auth.organization?.id && auth.switchOrganization(organizationId)
</script>

<template>
  <div class="space-y-5 p-3">
    <RouterLink :to="{ name: 'settings' }" class="flex items-center gap-3 border border-border/70 bg-card shadow-soft p-4">
      <UserAvatar :user="auth.user" size="lg" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">{{ auth.user?.name }}</p>
        <p class="truncate text-sm text-muted-foreground">{{ auth.user?.email }}</p>
      </div>
      <ChevronRight class="size-4 text-muted-foreground" />
    </RouterLink>

    <nav class="overflow-hidden border border-border/70 bg-card shadow-soft" aria-label="More">
      <RouterLink v-for="link in LINKS" :key="link.label" :to="link.to" class="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 active:bg-muted">
        <component :is="link.icon" class="size-5 text-muted-foreground" />
        <span class="flex-1">{{ link.label }}</span>
        <ChevronRight class="size-4 text-muted-foreground" />
      </RouterLink>
      <button v-if="canInstall" type="button" class="flex w-full items-center gap-3 border-t px-4 py-3.5 text-left active:bg-muted" @click="install">
        <Download class="size-5 text-muted-foreground" />
        <span class="flex-1">Install app</span>
      </button>
    </nav>

    <section class="space-y-2">
      <h2 class="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Organizations</h2>
      <nav class="overflow-hidden border border-border/70 bg-card shadow-soft" aria-label="Organizations">
        <button
          v-for="organization in auth.organizations"
          :key="organization.id"
          type="button"
          class="flex w-full items-center gap-3 border-b px-4 py-3.5 text-left last:border-b-0 active:bg-muted"
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
          class="flex items-center gap-3 border-t px-4 py-3.5 text-primary active:bg-muted"
        >
          <Plus class="size-5" /> <span class="flex-1">Create organization</span>
        </RouterLink>
      </nav>
    </section>

    <section class="space-y-2">
      <h2 class="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Projects</h2>
      <nav class="overflow-hidden border border-border/70 bg-card shadow-soft" aria-label="Projects">
        <RouterLink
          v-for="project in projects.joinedProjects"
          :key="project.id"
          :to="{ name: 'project-board', params: { projectId: project.id } }"
          class="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 active:bg-muted"
        >
          <span class="size-3" :style="{ backgroundColor: project.color }" />
          <span class="flex-1 truncate">{{ project.name }}</span>
          <span class="text-xs text-muted-foreground">{{ project.issueSummary?.open ?? 0 }} open</span>
        </RouterLink>
      </nav>
    </section>

    <button type="button" class="flex w-full items-center justify-center gap-2 border border-border/70 bg-card shadow-soft py-3.5 font-medium text-destructive active:bg-muted" @click="signOut">
      <LogOut class="size-5" /> Sign out
    </button>
  </div>
</template>
