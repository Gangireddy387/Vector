<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { CalendarDays, Flag, Hash, History, LayoutGrid, List, ListTodo, SlidersHorizontal, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { type LocationQuery, useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import { usersApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import { useUiStore } from '@/stores/ui.store'
import type { Issue, Sprint, UserSummary } from '@/types/models'
import { type IssueFilters, issuesApi } from '../api/issues.api'
import { savedFiltersApi } from '../api/saved-filters.api'
import BulkActionBar from '../components/BulkActionBar.vue'
import IssueCard from '../components/IssueCard.vue'
import IssueFilterBar, { type FilterKey } from '../components/IssueFilterBar.vue'
import IssueRow from '../components/IssueRow.vue'
import SavedFiltersMenu from '../components/SavedFiltersMenu.vue'
import { useIssueSelection } from '../composables/useIssueSelection'
import { useOpenIssue } from '../composables/useOpenIssue'
import { sanitizeCriteria } from '../lib/saved-filter-criteria'

type LayoutMode = 'list' | 'grid'

const FILTER_KEYS: FilterKey[] = ['q', 'assigneeId', 'statusCategory', 'type', 'priority', 'labelId', 'sprintId', 'overdue']
const SORT_OPTIONS: SelectFieldOption[] = [
  { value: 'updatedAt', label: 'Recently updated', icon: History },
  { value: 'createdAt', label: 'Newest first', icon: Sparkles },
  { value: 'priority', label: 'Priority', icon: Flag },
  { value: 'dueDate', label: 'Due date', icon: CalendarDays },
  { value: 'key', label: 'Task key', icon: Hash },
]
const PAGE_SIZE = 100

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const ui = useUiStore()
const openIssue = useOpenIssue()
const { isDesktop } = useDevice()

/** List (dense rows) or grid (cards). Remembered per device. */
const layout = useStorage<LayoutMode>('vector.tasks.layout', 'list')

const projectId = computed(() => (typeof route.params.projectId === 'string' ? route.params.projectId : undefined))
const project = computed(() => (projectId.value ? projects.details[projectId.value] : undefined))

const issues = ref<Issue[]>([])
const total = ref(0)
const isLoading = ref(true)
const limit = ref(PAGE_SIZE)
const sprints = ref<Sprint[]>([])
const collaborators = ref<UserSummary[]>([])
const isFilterSheetOpen = ref(false)

const readQuery = (query: LocationQuery) =>
  Object.fromEntries(FILTER_KEYS.map((key) => [key, typeof query[key] === 'string' ? (query[key] as string) : undefined])) as Pick<IssueFilters, FilterKey>

const filters = computed({
  get: () => readQuery(route.query),
  set: (value) => void router.replace({ query: { ...route.query, ...Object.fromEntries(FILTER_KEYS.map((key) => [key, value[key] || undefined])) } }),
})
const sort = computed({
  get: () => (typeof route.query.sort === 'string' ? route.query.sort : 'updatedAt') as IssueFilters['sort'],
  set: (value) => void router.replace({ query: { ...route.query, sort: value } }),
})
const setSort = (value: string | null | undefined) => value && (sort.value = value as IssueFilters['sort'])
const activeFilterCount = computed(() => Object.values(filters.value).filter(Boolean).length)

const members = computed<UserSummary[]>(() => project.value?.members ?? collaborators.value)
const selection = useIssueSelection(() => fetchIssues())

const latest = latestRequest()
/** Why the list did not load (shown with a retry), or null. */
const loadError = ref<string | null>(null)

async function fetchIssues() {
  const ticket = latest.start()
  const order = sort.value === 'dueDate' || sort.value === 'key' ? 'asc' : 'desc'
  try {
    const result = await issuesApi.list({ ...filters.value, projectId: projectId.value, sort: sort.value, order, limit: limit.value })
    if (!latest.isCurrent(ticket)) return
    issues.value = result.issues
    total.value = result.total
    loadError.value = null
  } catch (error) {
    if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
  } finally {
    if (latest.isCurrent(ticket)) isLoading.value = false
  }
}

watch([filters, sort, projectId], () => {
  limit.value = PAGE_SIZE
  selection.clear()
  void fetchIssues()
})
useProjectRealtime(projectId, fetchIssues)

onMounted(async () => {
  // Prefer a personal default saved view; otherwise global Tasks opens as "my work by due date".
  let deferredLoad = false
  const hasFilter = FILTER_KEYS.some((key) => typeof route.query[key] === 'string')
  const hasSort = typeof route.query.sort === 'string'
  if (!hasFilter && !hasSort) {
    try {
      const views = await savedFiltersApi.list(projectId.value)
      const preferred =
        views.find((view) => view.isDefault && view.projectId === (projectId.value ?? null)) ??
        views.find((view) => view.isDefault && !view.projectId)
      if (preferred) {
        deferredLoad = true
        void router.replace({ query: { ...route.query, ...sanitizeCriteria(preferred.criteria) } })
      } else if (!projectId.value) {
        deferredLoad = true
        void router.replace({ query: { ...route.query, assigneeId: 'me', sort: 'dueDate' } })
      }
    } catch {
      if (!projectId.value) {
        deferredLoad = true
        void router.replace({ query: { ...route.query, assigneeId: 'me', sort: 'dueDate' } })
      }
    }
  }
  if (!deferredLoad) void fetchIssues()
  if (projectId.value) {
    const detail = await projects.fetchProject(projectId.value)
    if (detail.type === 'scrum') sprints.value = await sprintsApi.list(projectId.value)
  } else {
    collaborators.value = await usersApi.search({})
  }
})

function loadMore() {
  limit.value += PAGE_SIZE
  void fetchIssues()
}

const allSelected = computed(() => issues.value.length > 0 && selection.count.value === issues.value.length)
const toggleAll = () => selection.setAll(allSelected.value ? [] : issues.value.map((issue) => issue.id))
const applySaved = (criteria: Record<string, string>) => {
  const cleaned = sanitizeCriteria(criteria)
  void router.replace({
    query: {
      ...Object.fromEntries(FILTER_KEYS.map((key) => [key, cleaned[key] || undefined])),
      sort: cleaned.sort || (typeof route.query.sort === 'string' ? route.query.sort : undefined),
    },
  })
}

const showList = computed(() => layout.value === 'list' && isDesktop.value)
const showGrid = computed(() => layout.value === 'grid' || !isDesktop.value)
</script>

<template>
  <div
    class="min-h-full w-full space-y-4 sm:space-y-5"
    :class="isDesktop ? (projectId ? 'px-5 py-4' : 'p-4 sm:p-5 lg:p-6') : 'p-3'"
  >
    <PageHeader
      v-if="!projectId"
      title="Tasks"
      description="Your work across projects — defaults to assigned to you, sorted by due date."
    />

    <!-- Desktop / tablet toolbar -->
    <div v-if="isDesktop" class="flex flex-wrap items-start justify-between gap-3">
      <IssueFilterBar v-model="filters" :members="members" :labels="project?.labels" :sprints="sprints" :show-sprint="project?.type === 'scrum'" />
      <div class="flex flex-wrap items-center gap-2">
        <SelectField :model-value="sort" :options="SORT_OPTIONS" size="sm" class="w-44 lg:w-48" aria-label="Sort by" @update:model-value="setSort" />
        <div class="inline-flex h-8 items-center rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Layout">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-7"
                :class="layout === 'list' && 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]'"
                :aria-pressed="layout === 'list'"
                aria-label="List view"
                @click="layout = 'list'"
              >
                <List />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-7"
                :class="layout === 'grid' && 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]'"
                :aria-pressed="layout === 'grid'"
                aria-label="Grid view"
                @click="layout = 'grid'"
              >
                <LayoutGrid />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid</TooltipContent>
          </Tooltip>
        </div>
        <SavedFiltersMenu :project-id="projectId" :criteria="filters" @apply="applySaved" />
      </div>
    </div>

    <!-- Phone toolbar (cards only — list/grid toggle is for tablet+) -->
    <div v-else class="flex items-center gap-2">
      <Button variant="outline" size="sm" class="flex-1" @click="isFilterSheetOpen = true">
        <SlidersHorizontal /> Filters<span v-if="activeFilterCount" class="text-primary">({{ activeFilterCount }})</span>
      </Button>
      <SelectField :model-value="sort" :options="SORT_OPTIONS" size="sm" class="flex-1" aria-label="Sort by" @update:model-value="setSort" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <p class="text-xs text-muted-foreground">{{ total }} issue{{ total === 1 ? '' : 's' }}</p>
      <label v-if="showGrid && issues.length" class="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox :model-value="allSelected" aria-label="Select all" @update:model-value="toggleAll" />
        Select all
      </label>
    </div>

    <div
      v-if="isLoading"
      :class="
        layout === 'grid'
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          : 'space-y-2'
      "
    >
      <Skeleton v-for="index in 8" :key="index" :class="layout === 'grid' ? 'h-36 w-full rounded-lg' : 'h-11 w-full'" />
    </div>

    <EmptyState v-else-if="loadError && !issues.length" :icon="ListTodo" title="Tasks did not load" :description="loadError">
      <Button variant="outline" @click="fetchIssues">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!issues.length"
      :icon="ListTodo"
      title="No tasks match"
      :description="activeFilterCount ? 'Try removing a filter.' : 'Create the first task to get started.'"
    >
      <Button v-if="activeFilterCount" variant="outline" @click="filters = {}">Clear filters</Button>
      <Button v-else @click="ui.openCreateIssue({ projectId })">Create task</Button>
    </EmptyState>

    <!-- Dense list (tablet + desktop) -->
    <div v-else-if="showList" class="overflow-x-auto rounded-xl border border-border shadow-soft">
      <div class="min-w-[36rem]">
        <div class="flex h-9 items-center gap-2 border-b bg-muted/40 px-2 text-xs font-medium text-muted-foreground">
          <Checkbox :model-value="allSelected" aria-label="Select all" @update:model-value="toggleAll" />
          <span class="w-4" />
          <span class="w-20">Key</span>
          <span class="flex-1">Title</span>
          <span class="w-28 text-center">Status</span>
          <span class="w-6 text-center" title="Story points">Pts</span>
          <span class="w-4" />
          <span class="w-6" />
        </div>
        <IssueRow
          v-for="issue in issues"
          :key="issue.id"
          :issue="issue"
          selectable
          :selected="selection.isSelected(issue.id)"
          @open="openIssue"
          @toggle-select="selection.toggle(issue.id)"
        />
      </div>
    </div>

    <!-- Grid cards (and phone list = stacked cards) -->
    <div
      v-else-if="showGrid"
      class="grid gap-2.5 sm:gap-3"
      :class="
        layout === 'grid'
          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          : 'grid-cols-1'
      "
    >
      <IssueCard
        v-for="issue in issues"
        :key="issue.id"
        :issue="issue"
        :show-project="!projectId"
        show-status
        :grid="layout === 'grid'"
        selectable
        :selected="selection.isSelected(issue.id)"
        @open="openIssue"
        @toggle-select="selection.toggle(issue.id)"
      />
    </div>

    <div v-if="issues.length < total" class="flex justify-center">
      <Button variant="outline" @click="loadMore">Load more</Button>
    </div>

    <BulkActionBar
      :count="selection.count.value"
      :members="members"
      :statuses="project?.statuses"
      :sprints="sprints"
      :labels="project?.labels"
      :busy="selection.isBusy.value"
      @apply="selection.apply"
      @delete="selection.removeSelected"
      @clear="selection.clear"
    />

    <Sheet v-model:open="isFilterSheetOpen">
      <SheetContent side="bottom">
        <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
        <div class="space-y-4 px-4 pb-4">
          <SavedFiltersMenu :project-id="projectId" :criteria="filters" stacked @apply="(criteria) => { applySaved(criteria); isFilterSheetOpen = false }" />
          <IssueFilterBar v-model="filters" :members="members" :labels="project?.labels" :sprints="sprints" :show-sprint="project?.type === 'scrum'" stacked />
          <Button class="w-full" @click="isFilterSheetOpen = false">Show {{ total }} results</Button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
