<script setup lang="ts">
import { Check, ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
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
const { isDesktop, isPhone, isWide } = useDevice()
const notFound = ref(false)
/**
 * Chat and similar fill the phone viewport. The board opts out on phone so one page
 * scrolls in MobileShell — otherwise ProjectLayout stays h-full and nests a second scrollbar.
 */
const fillHeight = computed(
  () =>
    !(isPhone.value && route.name === 'project-board') &&
    route.matched.some((record) => record.meta.fillHeight),
)

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
const isConvertingSample = ref(false)

/** Keep demo tasks as a real project (strip the sample flag). */
async function keepSample() {
  isConvertingSample.value = true
  try {
    const project = await projects.convertSampleProject(props.projectId, 'keep')
    toast.success('Now a real project', { description: project ? `“${project.name}” is yours to customize.` : undefined })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isConvertingSample.value = false
  }
}

/** Wipe the sample entirely and go create a fresh project. */
async function wipeSample() {
  const ok = await confirm({
    title: 'Wipe the sample and start fresh?',
    description: 'All of its tasks, sprints, comments, chat and history are removed for everyone. This cannot be undone.',
    confirmLabel: 'Wipe sample',
    destructive: true,
  })
  if (!ok) return
  isConvertingSample.value = true
  try {
    await projects.convertSampleProject(props.projectId, 'wipe')
    toast.success('Sample wiped', { description: 'Create your real project next.' })
    await router.replace({ name: 'projects', query: { welcome: '1' } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isConvertingSample.value = false
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

  <div v-else-if="!project" class="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading project">
    <div class="shrink-0 space-y-2 border-b border-border px-3 pt-2.5 pb-0 sm:px-4">
      <div class="flex items-center gap-3">
        <Skeleton class="size-7 rounded-[7px]" />
        <Skeleton class="h-5 w-48" />
        <Skeleton class="ml-auto h-8 w-20 rounded-md" :delay="1" />
      </div>
      <div class="flex gap-1 overflow-hidden pb-px">
        <Skeleton v-for="index in 6" :key="index" class="h-9 w-20 rounded-none" :delay="index" />
      </div>
    </div>
    <div class="grid min-h-0 flex-1 auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-hidden p-3 sm:p-4">
      <div v-for="col in 4" :key="col" class="flex min-w-[17rem] flex-col gap-2 rounded-xl bg-muted/40 p-1.5">
        <Skeleton class="h-10 w-full rounded-xl" :delay="col" />
        <Skeleton class="h-20 w-full rounded-[10px]" :delay="col" />
        <Skeleton class="h-20 w-full rounded-[10px]" :delay="col + 1" />
        <Skeleton class="h-16 w-full rounded-[10px]" :delay="col + 2" />
      </div>
    </div>
  </div>

  <div
    v-else
    class="flex min-w-0 flex-col"
    :class="
      isDesktop || fillHeight
        ? 'h-full min-h-0 overflow-hidden'
        : 'min-h-0 overflow-visible'
    "
  >
    <!-- Desktop header -->
    <header v-if="isWide" class="shrink-0 border-b border-border px-3 pt-2.5 sm:px-4">
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
          :key="`${item.label}-${item.name}`"
          v-slot="{ href, navigate, isActive }"
          :to="item.to ?? { name: item.name, params: { projectId: project.id } }"
          custom
        >
          <a
            :href="href"
            class="flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors sm:px-2.5"
            :class="[
              isActive && !item.locked ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              item.locked && 'opacity-70',
            ]"
            :aria-current="isActive && !item.locked ? 'page' : undefined"
            @click="navigate"
          >
            <component :is="item.icon" class="size-4 shrink-0" /> {{ item.label }}
            <span v-if="item.locked" class="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Pro</span>
          </a>
        </RouterLink>
      </nav>
    </header>

    <!--
      Section switcher. On phone the page scrolls in MobileShell — do not make this sticky.
      Sticky with a topbar offset left a gap under the real top bar where content slid through.
      Tablet keeps sticky top-0 inside the desktop shell scroll.
    -->
    <nav
      v-else
      class="z-20 shrink-0 border-b bg-background px-3 py-2"
      :class="!isPhone && 'sticky top-0'"
      aria-label="Project sections"
    >
      <div v-if="!isPhone" class="mb-2 flex min-w-0 items-center gap-2">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white shadow-glow" :style="{ backgroundColor: project.color }">
          {{ project.key.slice(0, 2) }}
        </span>
        <h1 class="min-w-0 flex-1 truncate text-[15px] font-semibold">{{ project.name }}</h1>
        <UserAvatarStack :users="project.members" :max="3" />
      </div>
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
              :key="`${item.label}-${item.name}`"
              class="gap-2"
              :class="item.name === activeSection?.name && !item.locked && 'bg-accent'"
              @select="router.push(item.to ?? { name: item.name, params: { projectId: project.id } })"
            >
              <component :is="item.icon" class="size-4 shrink-0" />
              {{ item.label }}
              <span v-if="item.locked" class="ml-auto text-[10px] font-semibold uppercase text-muted-foreground">Pro</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <MeetButton v-if="meetPreset" :preset="meetPreset" />
        <Button size="sm" class="shrink-0" @click="ui.openCreateIssue({ projectId: project.id })"><Plus /> Task</Button>
      </div>
    </nav>

    <!-- Sample → real: keep the demo work, or wipe and start fresh -->
    <div v-if="project.settings?.isSample" class="shrink-0 space-y-2 border-b border-border bg-primary/[0.05] px-3 py-2.5 sm:px-4">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        <Sparkles class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1">
          <span class="font-medium">This is a sample project.</span>
          <span class="ml-1 text-muted-foreground">Try the board, open a task with comments, then keep or wipe it.</span>
        </span>
        <div v-if="project.myRole === 'admin'" class="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button size="sm" class="max-sm:flex-1" :loading="isConvertingSample" @click="keepSample">
            <Check /> Keep as real project
          </Button>
          <Button variant="outline" size="sm" class="max-sm:flex-1 text-destructive hover:text-destructive" :disabled="isConvertingSample" @click="wipeSample">
            <Trash2 /> Wipe & start fresh
          </Button>
        </div>
      </div>
      <p class="pl-7 text-[11px] leading-relaxed text-muted-foreground">
        Tip: drag a card between columns · open the overdue bug for a comment · check Dependencies for the blocker · convert when you’re ready.
      </p>
    </div>

    <div
      class="min-w-0"
      :class="
        fillHeight
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
          : isDesktop
            ? 'min-h-0 flex-1 overflow-y-auto'
            : 'w-full overflow-visible'
      "
    >
      <RouterView />
    </div>
  </div>
</template>
