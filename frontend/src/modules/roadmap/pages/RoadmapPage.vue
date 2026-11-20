<script setup lang="ts">
import { CalendarRange, ChevronDown, ChevronUp, GitBranch, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { dependenciesApi, type DependencyEdge } from '@/modules/dependencies/dependencies.api'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { Issue, Sprint } from '@/types/models'
import { toast } from 'vue-sonner'
import RoadmapTimeline from '../components/RoadmapTimeline.vue'
import { buildRoadmapRows, type RoadmapScale } from '../lib/roadmap-timeline'
import { roadmapApi } from '../roadmap.api'

const route = useRoute()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const { isPhone, isWide } = useDevice()

const projectId = computed(() => route.params.projectId as string)

const issues = ref<Issue[]>([])
const sprints = ref<Sprint[]>([])
const dependencyEdges = ref<DependencyEdge[]>([])
const criticalIssueIds = ref<string[]>([])
const dependencyCycles = ref<string[][]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const hideDone = ref(true)
const datedOnly = ref(false)
const scale = ref<RoadmapScale>('week')
const expanded = ref<Set<string>>(new Set())
const showFilters = ref(false)
const showDependencies = ref(true)

const project = computed(() => projects.details[projectId.value])
const isScrum = computed(() => project.value?.type === 'scrum')
const canEdit = computed(() => projects.canEdit(projectId.value))

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
    await projects.fetchProject(id)
    const [roadmap, deps] = await Promise.all([
      roadmapApi.get(id),
      dependenciesApi.forProject(id).catch(() => null),
    ])
    if (projectId.value !== id) return
    issues.value = roadmap.issues
    sprints.value = roadmap.sprints
    dependencyEdges.value = deps?.edges ?? []
    criticalIssueIds.value = deps?.criticalPath.issueIds ?? []
    dependencyCycles.value = deps?.cycles ?? []
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

const visibleDependencyEdges = computed(() => (showDependencies.value && !isPhone.value ? dependencyEdges.value : []))

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

async function onReschedule(issue: Issue, changes: { startDate?: string; dueDate?: string }) {
  if (!canEdit.value) return
  const previous = { startDate: issue.startDate, dueDate: issue.dueDate }
  Object.assign(issue, changes)
  try {
    const updated = await roadmapApi.reschedule(projectId.value, issue.id, changes)
    Object.assign(issue, {
      startDate: updated.startDate,
      dueDate: updated.dueDate,
      updatedAt: updated.updatedAt,
    })
    toast.success(`${issue.key} updated on the roadmap`)
  } catch (error) {
    Object.assign(issue, previous)
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-col gap-2 sm:gap-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Roadmap</h1>
          <p class="hidden max-w-2xl text-sm text-muted-foreground sm:block">
            Timeline of epics and tasks — drag to move, resize edges for duration, or paint dates on empty rows.
            Block links draw finish→start connectors on the Gantt.
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
        <Button
          v-if="dependencyEdges.length && !isPhone"
          variant="outline"
          size="sm"
          :aria-pressed="showDependencies"
          @click="showDependencies = !showDependencies"
        >
          <GitBranch class="size-3.5" />
          {{ showDependencies ? 'Hide dependencies' : 'Show dependencies' }}
        </Button>
        <RouterLink
          v-if="dependencyEdges.length && !isPhone"
          :to="{ name: 'project-dependencies', params: { projectId } }"
          class="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Open graph
        </RouterLink>
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
      :can-edit="canEdit"
      :dependency-edges="visibleDependencyEdges"
      :critical-issue-ids="criticalIssueIds"
      :dependency-cycles="dependencyCycles"
      @toggle="toggleExpand"
      @open="openIssue"
      @reschedule="onReschedule"
    />
  </div>
</template>
