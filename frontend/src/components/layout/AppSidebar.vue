<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { BarChart3, Building2, CalendarDays, MessagesSquare, ChevronsLeft, ChevronsRight, FolderKanban, House, Inbox, ListTodo, Plus, ShieldCheck, Video } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
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
const messages = useMessagesStore()
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
    :class="[isCollapsed ? 'w-16' : 'w-60']"
    class="flex shrink-0 flex-col text-sidebar-foreground transition-[width] duration-200"
    aria-label="Main navigation"
  >
    <div class="flex h-14 items-center justify-between gap-1 px-2.5">
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
      <SidebarLink :to="{ name: 'home' }" label="Home" :icon="House" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'issues' }" label="All tasks" :icon="ListTodo" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'inbox' }" label="Inbox" :icon="Inbox" :badge="notifications.unreadCount" :collapsed="isCollapsed" />
      <SidebarLink
        v-if="messages.isAvailable"
        :to="{ name: 'messages' }"
        label="Messages"
        :icon="MessagesSquare"
        :badge="messages.unreadTotal"
        :collapsed="isCollapsed"
      />
      <SidebarLink :to="{ name: 'projects' }" label="Projects" :icon="FolderKanban" :collapsed="isCollapsed" exact />
      <SidebarLink v-if="auth.hasFeature('reports')" :to="{ name: 'reports' }" label="Reports" :icon="BarChart3" :collapsed="isCollapsed" exact />
      <SidebarLink :to="{ name: 'departments' }" label="Departments" :icon="Building2" :collapsed="isCollapsed" />
      <SidebarLink :to="{ name: 'calendar' }" label="Calendar" :icon="CalendarDays" :collapsed="isCollapsed" />
      <SidebarLink v-if="auth.hasFeature('meetings')" :to="{ name: 'meetings' }" label="Meetings" :icon="Video" :collapsed="isCollapsed" />
      <SidebarLink
        v-if="workspace.isAdmin"
        :to="{ name: 'workspace-admin' }"
        label="Organization"
        :icon="ShieldCheck"
        :collapsed="isCollapsed"
      />

      <div v-if="!isCollapsed" class="group/projects mt-5 mb-0.5 flex h-6 items-center justify-between pr-1 pl-2">
        <span class="text-[11.5px] font-medium text-muted-foreground">Your projects</span>
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-5 text-muted-foreground opacity-0 transition-opacity group-hover/projects:opacity-100 focus-visible:opacity-100"
          aria-label="New project"
          @click="isCreateProjectOpen = true"
        >
          <Plus class="size-3.5" />
        </Button>
      </div>
      <div v-else class="mx-2 my-3 border-t border-sidebar-border" />

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

    <div class="p-2">
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
