<script setup lang="ts">
import { CalendarRange, ChevronDown, ChevronUp, GitBranch, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageFrame from '@/components/common/PageFrame.vue'
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
  <PageFrame mode="bare" pad="compact" class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden sm:gap-4">
    <header class="relative flex shrink-0 flex-col gap-2 sm:gap-3">
      <div
        class="pointer-events-none absolute -inset-x-4 -top-4 h-24 opacity-90"
        style="background: radial-gradient(70% 120% at 6% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 65%)"
        aria-hidden="true"
      />
      <div class="relative flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5 sm:space-y-1">
          <p class="text-[11px] font-medium text-muted-foreground sm:text-xs">
            <span class="text-brand font-semibold">Timeline</span>
            <span class="mx-1.5 text-border">·</span>
            Plan across weeks
          </p>
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Roadmap</h1>
          <p class="hidden max-w-2xl text-sm text-muted-foreground sm:block">
            Gantt view of epics and tasks — drag to move, resize edges for duration, or paint dates on empty rows.
            Block links draw finish→start connectors.
          </p>
          <p class="text-xs text-muted-foreground sm:hidden">
            {{ stats.total }} items · {{ stats.dated }} dated
            <template v-if="isScrum"> · {{ sprints.length }} sprints</template>
          </p>
        </div>
        <div class="relative flex shrink-0 items-center gap-1.5">
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
        class="relative flex-wrap items-center gap-1.5 sm:gap-2"
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

    <section
      class="hidden shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-border/70 bg-card/70 px-3 py-2 shadow-soft backdrop-blur-sm sm:flex"
      aria-label="Roadmap summary"
    >
      <div class="flex items-baseline gap-1.5 pr-3">
        <span class="text-lg font-semibold tabular-nums tracking-tight">{{ stats.total }}</span>
        <span class="text-xs text-muted-foreground">on roadmap</span>
      </div>
      <div class="h-4 w-px shrink-0 bg-border/80" />
      <div class="flex items-baseline gap-1.5 px-3">
        <span class="text-lg font-semibold tabular-nums tracking-tight">{{ stats.dated }}</span>
        <span class="text-xs text-muted-foreground">with dates</span>
      </div>
      <div class="h-4 w-px shrink-0 bg-border/80" />
      <div class="flex items-baseline gap-1.5 px-3">
        <span class="text-lg font-semibold tabular-nums tracking-tight">{{ isScrum ? sprints.length : '—' }}</span>
        <span class="text-xs text-muted-foreground">{{ isScrum ? 'sprints' : 'kanban' }}</span>
      </div>
      <div v-if="dependencyEdges.length" class="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <GitBranch class="size-3.5 text-primary" />
        {{ dependencyEdges.length }} block{{ dependencyEdges.length === 1 ? '' : 's' }}
        <template v-if="criticalIssueIds.length"> · {{ criticalIssueIds.length }} on critical path</template>
      </div>
    </section>

    <div v-if="loading && !issues.length" class="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div class="flex border-b border-border/60">
        <Skeleton class="h-12 w-40 shrink-0 rounded-none border-r border-border/60 sm:w-64" />
        <div class="flex flex-1 gap-0">
          <Skeleton v-for="i in 6" :key="i" class="h-12 flex-1 rounded-none border-r border-border/40 last:border-0" />
        </div>
      </div>
      <div class="space-y-0">
        <div v-for="i in 8" :key="i" class="flex border-b border-border/40" :style="{ height: '44px' }">
          <Skeleton class="h-full w-40 shrink-0 rounded-none border-r border-border/60 sm:w-64" />
          <div class="relative flex-1 px-3 py-3">
            <Skeleton
              class="h-5 rounded-md"
              :style="{ width: `${28 + ((i * 17) % 45)}%`, marginLeft: `${(i * 11) % 35}%` }"
            />
          </div>
        </div>
      </div>
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
      description="Add start or due dates on epics and tasks — or paint dates directly on the timeline once work appears."
      class="min-h-0 flex-1"
    >
      <Button v-if="canEdit" variant="outline" as-child>
        <RouterLink :to="{ name: 'project-board', params: { projectId } }">Open board</RouterLink>
      </Button>
    </EmptyState>

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
  </PageFrame>
</template>
