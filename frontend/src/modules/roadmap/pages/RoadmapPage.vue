<script setup lang="ts">
import { CalendarRange, ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronUp, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { toast } from 'vue-sonner'
import RoadmapTimeline from '../components/RoadmapTimeline.vue'
import { buildRoadmapRows } from '../lib/roadmap-timeline'
import { roadmapApi } from '../roadmap.api'
import type { Issue } from '@/types/models'

const route = useRoute()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const { isPhone } = useDevice()

const projectId = computed(() => route.params.projectId as string)

const issues = ref<Issue[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const hideDone = ref(true)
const datedOnly = ref(false)
const expanded = ref<Set<string>>(new Set())
const showFilters = ref(false)

const canEdit = computed(() => projects.canEdit(projectId.value))

const rows = computed(() =>
  buildRoadmapRows(issues.value, { hideDone: hideDone.value, datedOnly: datedOnly.value }),
)

const stats = computed(() => {
  const walk = (list: ReturnType<typeof buildRoadmapRows>) => {
    let total = 0
    let dated = 0
    for (const row of list) {
      total += 1
      if (row.bar && !row.bar.derived) dated += 1
      const child = walk(row.children)
      total += child.total
      dated += child.dated
    }
    return { total, dated }
  }
  return walk(rows.value)
})

const summaryLine = computed(() => `${stats.value.total} items · ${stats.value.dated} dated`)

async function load() {
  const id = projectId.value
  if (!id) return
  loading.value = true
  loadError.value = null
  try {
    await projects.fetchProject(id)
    const roadmap = await roadmapApi.get(id)
    if (projectId.value !== id) return
    issues.value = roadmap.issues
    const next = new Set(expanded.value)
    for (const issue of roadmap.issues) {
      if (issue.type === 'epic') next.add(issue.id)
    }
    expanded.value = next
  } catch (error) {
    if (projectId.value !== id) return
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    if (projectId.value === id) loading.value = false
  }
}

watch(projectId, load, { immediate: true })
useSocketEvents({
  'issue:changed': (payload: { projectId?: string }) => {
    if (payload.projectId === projectId.value) void load()
  },
})

function toggleExpand(issueId: string) {
  const next = new Set(expanded.value)
  if (next.has(issueId)) next.delete(issueId)
  else next.add(issueId)
  expanded.value = next
}

function expandAll() {
  const next = new Set<string>()
  const walk = (list: typeof rows.value) => {
    for (const row of list) {
      if (row.children.length) next.add(row.issue.id)
      walk(row.children)
    }
  }
  walk(rows.value)
  expanded.value = next
}

function collapseAll() {
  expanded.value = new Set()
}
</script>

<template>
  <PageFrame mode="stack" pad="compact" gap="none" class="min-w-0 space-y-3 sm:space-y-4">
    <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div class="min-w-0">
        <h1 class="text-[20px] font-semibold tracking-tight">Roadmap</h1>
        <p class="mt-0.5 truncate text-[13px] text-muted-foreground">{{ summaryLine }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          v-if="isPhone"
          variant="outline"
          size="sm"
          :aria-expanded="showFilters"
          @click="showFilters = !showFilters"
        >
          View
          <ChevronUp v-if="showFilters" class="size-3.5" />
          <ChevronDown v-else class="size-3.5" />
        </Button>

        <template v-if="!isPhone || showFilters">
          <Button
            variant="outline"
            size="sm"
            :class="hideDone && 'border-primary/35 bg-primary/8 text-primary'"
            :aria-pressed="hideDone"
            @click="hideDone = !hideDone"
          >
            {{ hideDone ? 'Show done' : 'Hide done' }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :class="datedOnly && 'border-primary/35 bg-primary/8 text-primary'"
            :aria-pressed="datedOnly"
            @click="datedOnly = !datedOnly"
          >
            {{ datedOnly ? 'All items' : 'Dated only' }}
          </Button>
          <Button variant="ghost" size="sm" class="text-muted-foreground" aria-label="Expand all" @click="expandAll">
            <ChevronsUpDown class="size-3.5" />
            <span class="hidden sm:inline">Expand</span>
          </Button>
          <Button variant="ghost" size="sm" class="text-muted-foreground" aria-label="Collapse all" @click="collapseAll">
            <ChevronsDownUp class="size-3.5" />
            <span class="hidden sm:inline">Collapse</span>
          </Button>
        </template>

        <Button variant="outline" size="sm" :loading="loading" aria-label="Refresh" @click="load">
          <RefreshCw />
        </Button>
      </div>
    </header>

    <div v-if="loading && !issues.length" class="overflow-hidden rounded-lg border border-border bg-card">
      <div
        class="grid h-9 grid-cols-[minmax(0,1fr)_2.75rem] border-b border-border bg-muted/40 sm:grid-cols-[minmax(0,1fr)_7.5rem_2.75rem] md:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_2.75rem]"
      >
        <Skeleton class="h-full min-w-0 rounded-none" />
        <Skeleton class="hidden h-full rounded-none border-l border-border sm:block" />
        <Skeleton class="hidden h-full rounded-none border-l border-border md:block" />
        <Skeleton class="h-full rounded-none border-l border-border" />
      </div>
      <div
        v-for="i in 8"
        :key="i"
        class="grid h-11 grid-cols-[minmax(0,1fr)_2.75rem] items-center border-b border-border/50 last:border-0 sm:grid-cols-[minmax(0,1fr)_7.5rem_2.75rem] md:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_2.75rem]"
      >
        <Skeleton class="mx-3 h-5 min-w-0 rounded-md" :style="{ maxWidth: `${40 + ((i * 11) % 45)}%` }" />
        <Skeleton class="mx-3 hidden h-5 rounded-full sm:block" />
        <Skeleton class="mx-3 hidden h-4 rounded-md md:block" />
        <Skeleton class="mx-auto size-6 rounded-full" />
      </div>
    </div>

    <EmptyState
      v-else-if="loadError && !issues.length"
      :icon="CalendarRange"
      title="Roadmap did not load"
      :description="loadError"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!rows.length"
      :icon="CalendarRange"
      title="Nothing on the roadmap yet"
      description="Add start or due dates on epics and tasks to see them here."
    >
      <Button v-if="canEdit" variant="outline" as-child>
        <RouterLink :to="{ name: 'project-board', params: { projectId } }">Open board</RouterLink>
      </Button>
    </EmptyState>

    <RoadmapTimeline
      v-else
      class="min-w-0"
      :rows="rows"
      :expanded="expanded"
      :compact="isPhone"
      @toggle="toggleExpand"
      @open="openIssue"
    />
  </PageFrame>
</template>
