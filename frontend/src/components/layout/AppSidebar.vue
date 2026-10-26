<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { BarChart3, Building2, CalendarDays, ChevronsLeft, ChevronsRight, FolderKanban, House, Inbox, ListTodo, Plus, ShieldCheck } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import OrganizationSwitcher from './OrganizationSwitcher.vue'
import { getProjectNavigation } from './projectNavigation'
import SidebarLink from './SidebarLink.vue'
import UserMenu from './UserMenu.vue'

defineEmits<{ showShortcuts: [] }>()

const route = useRoute()
const ui = useUiStore()
const projects = useProjectsStore()
const notifications = useNotificationsStore()
const workspace = useWorkspaceStore()
const auth = useAuthStore()

const isCollapsed = useStorage('vector.sidebar.collapsed', false)
const isCreateProjectOpen = ref(false)

const activeProjectId = computed(() => (typeof route.params.projectId === 'string' ? route.params.projectId : null))
const navigationFor = (projectId: string) => {
  const project = projects.details[projectId] ?? projects.projects.find((item) => item.id === projectId)
  return project ? getProjectNavigation(project, auth.hasFeature) : []
}

const openCreateIssue = () => ui.openCreateIssue({ projectId: activeProjectId.value ?? undefined })
</script>

<template>
  <aside
    :class="[isCollapsed ? 'w-16' : 'w-64']"
    class="flex shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/75 text-sidebar-foreground backdrop-blur-xl transition-[width] duration-200"
    aria-label="Main navigation"
  >
    <div class="flex h-14 items-center justify-between gap-2 px-3">
      <OrganizationSwitcher :compact="isCollapsed" />
      <Tooltip v-if="!isCollapsed">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Collapse sidebar"
            @click="isCollapsed = true"
          >
            <ChevronsLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Collapse sidebar</TooltipContent>
      </Tooltip>
    </div>

    <div class="px-3 pb-2">
      <Button v-if="!isCollapsed" variant="brand" class="w-full justify-start" @click="openCreateIssue">
        <Plus />
        Create task
        <kbd class="ml-auto border border-primary-foreground/30 px-1.5 text-[10px] font-medium">C</kbd>
      </Button>
      <Tooltip v-else>
        <TooltipTrigger as-child>
          <Button variant="brand" size="icon" class="w-full" aria-label="Create task" @click="openCreateIssue"><Plus /></Button>
        </TooltipTrigger>
        <TooltipContent side="right">Create task (C)</TooltipContent>
      </Tooltip>
    </div>

    <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
      <SidebarLink :to="{ name: 'home' }" label="Home" :icon="House" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'issues' }" label="All tasks" :icon="ListTodo" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'inbox' }" label="Inbox" :icon="Inbox" :badge="notifications.unreadCount" :collapsed="isCollapsed" />
      <SidebarLink :to="{ name: 'projects' }" label="Projects" :icon="FolderKanban" :collapsed="isCollapsed" exact />
      <SidebarLink v-if="auth.hasFeature('reports')" :to="{ name: 'reports' }" label="Reports" :icon="BarChart3" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'departments' }" label="Departments" :icon="Building2" :collapsed="isCollapsed" />
      <SidebarLink :to="{ name: 'calendar' }" label="Calendar" :icon="CalendarDays" :collapsed="isCollapsed" />
      <SidebarLink
        v-if="workspace.isAdmin"
        :to="{ name: 'workspace-admin' }"
        label="Organization"
        :icon="ShieldCheck"
        :collapsed="isCollapsed"
      />

      <div v-if="!isCollapsed" class="mt-5 mb-1 flex items-center justify-between px-2">
        <span class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Your projects</span>
        <Button variant="ghost" size="icon-sm" class="size-6" aria-label="New project" @click="isCreateProjectOpen = true">
          <Plus class="size-3.5" />
        </Button>
      </div>
      <div v-else class="my-3 border-t border-sidebar-border" />

      <template v-for="project in projects.joinedProjects" :key="project.id">
        <SidebarLink
          :to="{ name: 'project-board', params: { projectId: project.id } }"
          :label="project.name"
          :color="project.color"
          :collapsed="isCollapsed"
        />
        <template v-if="!isCollapsed && activeProjectId === project.id">
          <SidebarLink
            v-for="item in navigationFor(project.id)"
            :key="item.name"
            :to="{ name: item.name, params: { projectId: project.id } }"
            :label="item.label"
            :icon="item.icon"
            nested
          />
        </template>
      </template>
    </nav>

    <div class="border-t border-sidebar-border p-2">
      <Tooltip v-if="isCollapsed">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="mb-1 w-full text-muted-foreground hover:text-foreground"
            aria-label="Expand sidebar"
            @click="isCollapsed = false"
          >
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
