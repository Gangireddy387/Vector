<script setup lang="ts">
import { CalendarRange, ChevronDown, ChevronUp, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { issuesApi } from '@/modules/issues/api/issues.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Issue, Sprint } from '@/types/models'
import { toast } from 'vue-sonner'
import RoadmapTimeline from '../components/RoadmapTimeline.vue'
import { buildRoadmapRows, type RoadmapScale } from '../lib/roadmap-timeline'

const route = useRoute()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const { isPhone, isWide } = useDevice()

const projectId = computed(() => route.params.projectId as string)

const issues = ref<Issue[]>([])
const sprints = ref<Sprint[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const hideDone = ref(true)
const datedOnly = ref(false)
const scale = ref<RoadmapScale>('week')
const expanded = ref<Set<string>>(new Set())
const showFilters = ref(false)

const project = computed(() => projects.details[projectId.value])
const isScrum = computed(() => project.value?.type === 'scrum')

const rows = computed(() =>
  buildRoadmapRows(issues.value, { hideDone: hideDone.value, datedOnly: datedOnly.value }),
)

const dayWidth = computed(() => {
  if (scale.value === 'month') return isWide.value ? 14 : 10
  return isWide.value ? 28 : 18
})

const labelWidth = computed(() => (isWide.value ? 280 : 168))

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

async function load() {
  const id = projectId.value
  if (!id) return
  loading.value = true
  loadError.value = null
  try {
    const detail = await projects.fetchProject(id)
    const [listed, sprintList] = await Promise.all([
      issuesApi.list({ projectId: id, limit: 1000, sort: 'position', order: 'asc' }),
      detail.type === 'scrum' ? sprintsApi.list(id) : Promise.resolve([] as Sprint[]),
    ])
    if (projectId.value !== id) return
    issues.value = listed.issues
    sprints.value = sprintList.filter((sprint) => sprint.state !== 'completed' || Boolean(sprint.startDate && sprint.endDate))
    const next = new Set(expanded.value)
    for (const issue of listed.issues) {
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
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-col gap-2 sm:gap-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Roadmap</h1>
          <p class="hidden max-w-2xl text-sm text-muted-foreground sm:block">
            Timeline of epics and tasks by start and due dates.
          </p>
          <p class="text-xs text-muted-foreground sm:hidden">
            {{ stats.total }} items · {{ stats.dated }} dated
            <template v-if="isScrum"> · {{ sprints.length }} sprints</template>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <Button
            v-if="isPhone"
            variant="outline"
            size="sm"
            class="sm:hidden"
            :aria-expanded="showFilters"
            @click="showFilters = !showFilters"
          >
            Filters
            <ChevronUp v-if="showFilters" class="size-3.5" />
            <ChevronDown v-else class="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
        </div>
      </div>

      <div
        :class="isPhone && !showFilters ? 'hidden' : 'flex'"
        class="flex-wrap items-center gap-1.5 sm:gap-2"
      >
        <Button variant="outline" size="sm" :aria-pressed="hideDone" @click="hideDone = !hideDone">
          {{ hideDone ? 'Show done' : 'Hide done' }}
        </Button>
        <Button variant="outline" size="sm" :aria-pressed="datedOnly" @click="datedOnly = !datedOnly">
          {{ datedOnly ? 'Show undated' : 'Dated only' }}
        </Button>
        <div class="flex overflow-hidden rounded-md border">
          <Button
            variant="ghost"
            size="sm"
            class="rounded-none border-r"
            :class="scale === 'week' && 'bg-muted'"
            :aria-pressed="scale === 'week'"
            @click="scale = 'week'"
          >
            Weeks
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="rounded-none"
            :class="scale === 'month' && 'bg-muted'"
            :aria-pressed="scale === 'month'"
            @click="scale = 'month'"
          >
            Months
          </Button>
        </div>
        <Button variant="outline" size="sm" @click="expandAll">Expand</Button>
        <Button variant="outline" size="sm" @click="collapseAll">Collapse</Button>
      </div>
    </header>

    <section class="hidden shrink-0 gap-3 sm:grid sm:grid-cols-3">
      <article class="rounded-xl border border-border/80 bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">On the roadmap</p>
        <p class="mt-1 text-xl font-semibold tabular-nums lg:mt-2 lg:text-2xl">{{ stats.total }}</p>
        <p class="text-xs text-muted-foreground">Visible work items</p>
      </article>
      <article class="rounded-xl border border-border/80 bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">With dates</p>
        <p class="mt-1 text-xl font-semibold tabular-nums lg:mt-2 lg:text-2xl">{{ stats.dated }}</p>
        <p class="text-xs text-muted-foreground">Own start or due date</p>
      </article>
      <article class="rounded-xl border border-border/80 bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Sprints</p>
        <p class="mt-1 text-xl font-semibold tabular-nums lg:mt-2 lg:text-2xl">{{ isScrum ? sprints.length : '—' }}</p>
        <p class="text-xs text-muted-foreground">{{ isScrum ? 'Shown as timeline bands' : 'Kanban project' }}</p>
      </article>
    </section>

    <div v-if="loading && !issues.length" class="min-h-0 flex-1 space-y-2">
      <Skeleton class="h-10 w-full rounded-xl" />
      <Skeleton class="h-full min-h-48 w-full rounded-xl sm:min-h-64" />
    </div>

    <EmptyState
      v-else-if="loadError && !issues.length"
      :icon="CalendarRange"
      title="Roadmap did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!rows.length"
      :icon="CalendarRange"
      title="Nothing on the roadmap yet"
      description="Add start or due dates on epics and tasks to see them on the timeline."
      class="min-h-0 flex-1"
    />

    <RoadmapTimeline
      v-else
      class="min-h-0 min-w-0 flex-1"
      :rows="rows"
      :sprints="isScrum ? sprints : []"
      :scale="scale"
      :expanded="expanded"
      :compact="isPhone"
      :day-width="dayWidth"
      :label-width="labelWidth"
      @toggle="toggleExpand"
      @open="openIssue"
    />
  </div>
</template>
