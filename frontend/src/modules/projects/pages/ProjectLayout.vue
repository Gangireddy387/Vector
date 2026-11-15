<script setup lang="ts">
import { ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useConfirm } from '@/composables/useConfirm'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { getProjectNavigation } from '@/components/layout/projectNavigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage, isNotFoundError } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import MeetButton from '@/modules/meetings/components/MeetButton.vue'
import type { MeetingPreset } from '@/modules/meetings/useMeetingActions'
import { useUiStore } from '@/stores/ui.store'
import { useProjectsStore } from '../projects.store'

const props = defineProps<{ projectId: string }>()

const route = useRoute()
const projects = useProjectsStore()
const ui = useUiStore()
const auth = useAuthStore()
const { isDesktop } = useDevice()
const notFound = ref(false)

const project = computed(() => projects.details[props.projectId])
const meetPreset = computed<MeetingPreset | null>(() =>
  project.value ? { title: `${project.value.name} sync`, people: project.value.members, context: { type: 'project', id: project.value.id } } : null,
)
const navigation = computed(() => (project.value ? getProjectNavigation(project.value, auth.hasFeature) : []))
const activeSection = computed(() => navigation.value.find((item) => item.name === route.name) ?? navigation.value[0] ?? null)

/** A failure other than "not found" (offline, server restarting) offers to try again instead. */
const loadError = ref<string | null>(null)

async function loadProject(projectId: string) {
  notFound.value = false
  loadError.value = null
  try {
    await projects.fetchProject(projectId, true)
  } catch (error) {
    if (projectId !== props.projectId) return
    if (isNotFoundError(error)) notFound.value = true
    else loadError.value = getErrorMessage(error)
  }
}

watch(
  () => props.projectId,
  (projectId) => {
    projects.currentProjectId = projectId
    void loadProject(projectId)
  },
  { immediate: true },
)
onBeforeUnmount(() => (projects.currentProjectId = null))

const router = useRouter()
const confirm = useConfirm()
const isDeletingSample = ref(false)
async function deleteSample() {
  const ok = await confirm({
    title: 'Delete the sample project?',
    description: 'All of its tasks, sprints, comments, chat and history are removed for everyone. This cannot be undone.',
    confirmLabel: 'Delete sample project',
    destructive: true,
  })
  if (!ok) return
  isDeletingSample.value = true
  try {
    await projects.deleteProject(props.projectId)
    toast.success('Sample project deleted')
    await router.replace({ name: 'home' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDeletingSample.value = false
  }
}
</script>

<template>
  <EmptyState v-if="notFound" title="Project not found" description="It may have been deleted or you no longer have access." class="py-20">
    <Button as-child variant="outline"><RouterLink :to="{ name: 'projects' }">All projects</RouterLink></Button>
  </EmptyState>

  <EmptyState v-else-if="loadError && !project" title="The project did not load" :description="loadError" class="py-20">
    <Button variant="outline" @click="loadProject(projectId)">Try again</Button>
  </EmptyState>

  <div v-else-if="!project" class="space-y-4 p-6">
    <Skeleton class="h-8 w-64" />
    <Skeleton class="h-96 w-full" />
  </div>

  <div v-else class="flex min-h-0 min-w-0 flex-col overflow-x-hidden" :class="isDesktop ? 'h-full min-h-full' : 'h-full'">
    <!-- Desktop header -->
    <header v-if="isDesktop" class="shrink-0 border-b border-border px-3 pt-2.5 sm:px-4">
      <div class="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white shadow-glow" :style="{ backgroundColor: project.color }">
          {{ project.key.slice(0, 2) }}
        </span>
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h1 class="truncate text-[15px] font-semibold">{{ project.name }}</h1>
          <span v-if="project.team" class="hidden truncate text-xs text-muted-foreground lg:inline">· {{ project.team.name }} team</span>
        </div>
        <UserAvatarStack :users="project.members" :max="4" class="hidden sm:flex" />
        <span class="ml-auto flex shrink-0 items-center gap-2">
          <MeetButton v-if="meetPreset" :preset="meetPreset" />
          <Button size="sm" @click="ui.openCreateIssue({ projectId: project.id })"><Plus /> Task</Button>
        </span>
      </div>
      <nav class="mt-1.5 -mb-px flex gap-0.5 overflow-x-auto scrollbar-none" aria-label="Project sections">
        <RouterLink
          v-for="item in navigation"
          :key="item.name"
          v-slot="{ href, navigate, isActive }"
          :to="{ name: item.name, params: { projectId: project.id } }"
          custom
        >
          <a
            :href="href"
            class="flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors sm:px-2.5"
            :class="isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            :aria-current="isActive ? 'page' : undefined"
            @click="navigate"
          >
            <component :is="item.icon" class="size-4 shrink-0" /> {{ item.label }}
          </a>
        </RouterLink>
      </nav>
    </header>

    <!-- Mobile section switcher: dropdown (no hidden horizontal scroll) -->
    <nav v-else class="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 shrink-0 border-b bg-background px-3 py-2" aria-label="Project sections">
      <div class="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="min-w-0 flex-1 justify-between gap-2 px-3">
              <span class="flex min-w-0 items-center gap-2">
                <component :is="activeSection?.icon" v-if="activeSection" class="size-4 shrink-0 text-primary" />
                <span class="truncate font-medium">{{ activeSection?.label ?? 'Section' }}</span>
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-[min(18rem,calc(100vw-1.5rem))]">
            <DropdownMenuItem
              v-for="item in navigation"
              :key="item.name"
              class="gap-2"
              :class="item.name === activeSection?.name && 'bg-accent'"
              @select="router.push({ name: item.name, params: { projectId: project.id } })"
            >
              <component :is="item.icon" class="size-4 shrink-0" />
              {{ item.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <MeetButton v-if="meetPreset" :preset="meetPreset" />
        <Button size="sm" class="shrink-0" @click="ui.openCreateIssue({ projectId: project.id })"><Plus /> Task</Button>
      </div>
    </nav>

    <!-- The sample project says what it is and can be removed, with everything in it, in one click -->
    <div v-if="project.settings?.isSample" class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-primary/[0.05] px-3 py-2 text-[13px] sm:px-4">
      <Sparkles class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 flex-1">
        <span class="font-medium">This is a sample project.</span>
        <span class="ml-1 text-muted-foreground">Explore freely; deleting it removes all its tasks, sprints, chat and history.</span>
      </span>
      <Button v-if="project.myRole === 'admin'" variant="outline" size="sm" class="max-sm:w-full text-destructive hover:text-destructive" :loading="isDeletingSample" @click="deleteSample">
        <Trash2 /> Delete sample project
      </Button>
    </div>

    <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden" :class="isDesktop ? 'overflow-y-auto' : 'flex flex-col'">
      <RouterView />
    </div>
  </div>
</template>
