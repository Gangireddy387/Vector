<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { BarChart3, CalendarDays, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, House, Inbox, LayoutGrid, ListTodo, MessageCircle, Network, Plus, Target, UserPlus, Video } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDevice } from '@/composables/useDevice'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import OrganizationSwitcher from './OrganizationSwitcher.vue'
import { getProjectNavigation } from './projectNavigation'
import SidebarLink from './SidebarLink.vue'
import UserMenu from './UserMenu.vue'

defineEmits<{ showShortcuts: [] }>()

const route = useRoute()
const ui = useUiStore()
const projects = useProjectsStore()
const notifications = useNotificationsStore()
const messages = useMessagesStore()
const auth = useAuthStore()
const { isTablet } = useDevice()

const isCollapsed = useStorage('vector.sidebar.collapsed', false)
/** Tablets keep the icon rail so the page has room; the user can still expand. */
watch(isTablet, (tablet) => {
  if (tablet) isCollapsed.value = true
}, { immediate: true })
/** Which sections are folded away, remembered per device. */
const folded = useStorage<Record<string, boolean>>('vector.sidebar.folded', {})
const toggle = (section: string) => (folded.value = { ...folded.value, [section]: !folded.value[section] })
const isCreateProjectOpen = ref(false)

const activeProjectId = computed(() => (typeof route.params.projectId === 'string' ? route.params.projectId : null))
const navigationFor = (projectId: string) => {
  const project = projects.details[projectId] ?? projects.projects.find((item) => item.id === projectId)
  return project ? getProjectNavigation(project, auth.hasFeature) : []
}

/** Long project lists show the first few (plus the open one) until "Show all". */
const PROJECT_LIMIT = 6
const showAllProjects = ref(false)
const visibleProjects = computed(() => {
  const all = projects.joinedProjects
  if (showAllProjects.value || all.length <= PROJECT_LIMIT + 1) return all
  const first = all.slice(0, PROJECT_LIMIT)
  const open = all.find((project) => project.id === activeProjectId.value)
  return open && !first.includes(open) ? [...first, open] : first
})
const hiddenProjectCount = computed(() => projects.joinedProjects.length - visibleProjects.value.length)

const showStandupRollup = computed(
  () =>
    auth.hasFeature('chat') &&
    projects.joinedProjects.some((project) => project.myRole === 'admin' || project.leadId === auth.user?.id),
)

const workspaceLinks = computed(() => [
  { name: 'standup-rollup', label: 'Standup rollup', icon: ClipboardList, show: showStandupRollup.value, locked: false as boolean, to: { name: 'standup-rollup' } as const },
  {
    name: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    show: true,
    locked: !auth.hasFeature('calendar'),
    to: auth.hasFeature('calendar') ? ({ name: 'calendar' } as const) : ({ name: 'feature-locked', query: { feature: 'calendar' } } as const),
  },
  {
    name: 'meetings',
    label: 'Meetings',
    icon: Video,
    show: true,
    locked: !auth.hasFeature('meetings'),
    to: auth.hasFeature('meetings') ? ({ name: 'meetings' } as const) : ({ name: 'feature-locked', query: { feature: 'meetings' } } as const),
  },
  { name: 'reports', label: 'Reports', icon: BarChart3, show: auth.hasFeature('reports'), locked: false, to: { name: 'reports' } as const, shortcut: 'G R', exact: true },
  {
    name: 'goals',
    label: 'Goals',
    icon: Target,
    show: true,
    locked: !auth.hasFeature('goals'),
    to: auth.hasFeature('goals') ? ({ name: 'goals' } as const) : ({ name: 'feature-locked', query: { feature: 'goals' } } as const),
  },
  {
    name: 'portfolio',
    label: 'Portfolio',
    icon: LayoutGrid,
    show: true,
    locked: !auth.hasFeature('portfolio'),
    to: auth.hasFeature('portfolio')
      ? ({ name: 'portfolio' } as const)
      : ({ name: 'feature-locked', query: { feature: 'portfolio' } } as const),
  },
  {
    name: 'departments',
    label: 'Departments',
    icon: Network,
    show: auth.isOrganizationAdmin || auth.hasPermission('workspace.structure'),
    locked: false,
    to: { name: 'departments' } as const,
  },
])

const messagesLink = computed(() =>
  messages.isAvailable
    ? { to: { name: 'messages' } as const, locked: false }
    : { to: { name: 'feature-locked', query: { feature: ['directMessages', 'teamChat'] } } as const, locked: true },
)

const openCreateIssue = () => ui.openCreateIssue({ projectId: activeProjectId.value ?? undefined })
</script>

<template>
  <aside
    :class="[isCollapsed ? 'w-16' : 'w-60']"
    class="flex shrink-0 flex-col text-sidebar-foreground transition-[width] duration-200"
    aria-label="Main navigation"
  >
    <div class="flex h-14 items-center justify-between gap-1 px-2.5">
      <OrganizationSwitcher :compact="isCollapsed" />
      <Tooltip v-if="!isCollapsed">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-foreground" aria-label="Collapse sidebar" @click="isCollapsed = true">
            <ChevronsLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Collapse sidebar</TooltipContent>
      </Tooltip>
    </div>

    <div class="px-2.5 pb-1.5">
      <Button v-if="!isCollapsed" variant="outline" class="w-full justify-start text-foreground" @click="openCreateIssue">
        <Plus class="text-primary" />
        Create task
        <kbd class="ml-auto rounded-[4px] border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground">C</kbd>
      </Button>
      <Tooltip v-else>
        <TooltipTrigger as-child>
          <Button variant="outline" size="icon" class="w-full" aria-label="Create task" @click="openCreateIssue"><Plus class="text-primary" /></Button>
        </TooltipTrigger>
        <TooltipContent side="right">Create task (C)</TooltipContent>
      </Tooltip>
    </div>

    <nav class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2.5 py-2 scrollbar-thin">
      <!-- Workday: the loop people run every morning -->
      <SidebarLink :to="{ name: 'home' }" label="Home" :icon="House" shortcut="G H" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'inbox' }" label="Inbox" :icon="Inbox" shortcut="G I" :badge="notifications.unreadCount" :collapsed="isCollapsed" />
      <SidebarLink :to="{ name: 'issues' }" label="Tasks" :icon="ListTodo" shortcut="G A" :collapsed="isCollapsed" />
      <SidebarLink
        :to="messagesLink.to"
        label="Messages"
        :icon="MessageCircle"
        :badge="messages.isAvailable ? messages.unreadTotal : 0"
        :collapsed="isCollapsed"
        :locked="messagesLink.locked"
      />

      <!-- Rhythm: standup, calendar and meetings that close the loop -->
      <button
        v-if="!isCollapsed"
        type="button"
        class="group/section mt-4 mb-0.5 flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        :aria-expanded="!folded.workspace"
        @click="toggle('workspace')"
      >
        Rhythm
        <ChevronRight class="size-3 transition-transform" :class="!folded.workspace && 'rotate-90'" />
      </button>
      <div v-else class="mx-2 my-3 border-t border-sidebar-border" />
      <template v-if="isCollapsed || !folded.workspace">
        <template v-for="link in workspaceLinks" :key="link.name">
          <SidebarLink
            v-if="link.show"
            :to="link.to"
            :label="link.label"
            :icon="link.icon"
            :shortcut="link.shortcut"
            :exact="link.exact"
            :collapsed="isCollapsed"
            :locked="link.locked"
          />
        </template>
      </template>

      <!-- Projects: the heading opens the full list -->
      <div v-if="!isCollapsed" class="group/section mt-4 mb-0.5 flex h-6 items-center gap-0.5 pr-1">
        <RouterLink
          :to="{ name: 'projects' }"
          class="flex h-6 items-center rounded-md px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          title="All projects (G P)"
        >
          Projects
        </RouterLink>
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          :aria-expanded="!folded.projects"
          :aria-label="folded.projects ? 'Show projects' : 'Hide projects'"
          @click="toggle('projects')"
        >
          <ChevronRight class="size-3 transition-transform" :class="!folded.projects && 'rotate-90'" />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="ml-auto size-5 text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100"
          aria-label="New project"
          title="New project"
          @click="isCreateProjectOpen = true"
        >
          <Plus class="size-3.5" />
        </Button>
      </div>
      <div v-else class="mx-2 my-3 border-t border-sidebar-border" />

      <template v-if="isCollapsed || !folded.projects">
        <template v-for="project in visibleProjects" :key="project.id">
          <SidebarLink :to="{ name: 'project-board', params: { projectId: project.id } }" :label="project.name" :color="project.color" :collapsed="isCollapsed" />
          <template v-if="!isCollapsed && activeProjectId === project.id">
            <SidebarLink
              v-for="item in navigationFor(project.id)"
              :key="`${item.label}-${item.name}`"
              :to="item.to ?? { name: item.name, params: { projectId: project.id } }"
              :label="item.label"
              :icon="item.icon"
              :locked="item.locked"
              nested
            />
          </template>
        </template>
        <button
          v-if="!isCollapsed && (hiddenProjectCount > 0 || showAllProjects)"
          type="button"
          class="flex h-7 items-center rounded-md px-2 pl-[1.85rem] text-[12.5px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
          @click="showAllProjects = !showAllProjects"
        >
          {{ showAllProjects ? 'Show less' : `Show all (${hiddenProjectCount} more)` }}
        </button>
        <button
          v-if="!isCollapsed && !projects.joinedProjects.length"
          type="button"
          class="flex h-8 items-center gap-2.5 rounded-md border border-dashed border-border px-2 text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground"
          @click="isCreateProjectOpen = true"
        >
          <Plus class="size-4" /> Create your first project
        </button>
      </template>
    </nav>

    <div class="space-y-1 p-2">
      <!-- Growing the team is one click away for admins -->
      <Tooltip v-if="auth.hasPermission('workspace.people')" :disabled="!isCollapsed">
        <TooltipTrigger as-child>
          <RouterLink
            :to="{ name: 'workspace-admin', query: { tab: 'people' } }"
            class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            :class="isCollapsed && 'justify-center px-0'"
          >
            <UserPlus class="size-4 shrink-0 text-muted-foreground" />
            <span v-if="!isCollapsed">Invite people</span>
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right">Invite people</TooltipContent>
      </Tooltip>
      <Tooltip v-if="isCollapsed">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="w-full text-muted-foreground hover:text-foreground" aria-label="Expand sidebar" @click="isCollapsed = false">
            <ChevronsRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand sidebar</TooltipContent>
      </Tooltip>
      <UserMenu :collapsed="isCollapsed" @show-shortcuts="$emit('showShortcuts')" />
    </div>

    <CreateProjectDialog v-model:open="isCreateProjectOpen" />
  </aside>
</template>
