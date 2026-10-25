<script setup lang="ts">
import { CalendarDays, Flag, Hash, History, ListTodo, SlidersHorizontal, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { type LocationQuery, useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { usersApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import { useUiStore } from '@/stores/ui.store'
import type { Issue, Sprint, UserSummary } from '@/types/models'
import { type IssueFilters, issuesApi } from '../api/issues.api'
import BulkActionBar from '../components/BulkActionBar.vue'
import IssueCard from '../components/IssueCard.vue'
import IssueFilterBar, { type FilterKey } from '../components/IssueFilterBar.vue'
import IssueRow from '../components/IssueRow.vue'
import SavedFiltersMenu from '../components/SavedFiltersMenu.vue'
import { useIssueSelection } from '../composables/useIssueSelection'
import { useOpenIssue } from '../composables/useOpenIssue'

const FILTER_KEYS: FilterKey[] = ['q', 'assigneeId', 'statusCategory', 'type', 'priority', 'labelId', 'sprintId', 'overdue']
const SORT_OPTIONS: SelectFieldOption[] = [
  { value: 'updatedAt', label: 'Recently updated', icon: History },
  { value: 'createdAt', label: 'Newest first', icon: Sparkles },
  { value: 'priority', label: 'Priority', icon: Flag },
  { value: 'dueDate', label: 'Due date', icon: CalendarDays },
  { value: 'key', label: 'Issue key', icon: Hash },
]
const PAGE_SIZE = 100

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const ui = useUiStore()
const openIssue = useOpenIssue()
const { isDesktop } = useDevice()

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

async function fetchIssues() {
  const order = sort.value === 'dueDate' || sort.value === 'key' ? 'asc' : 'desc'
  const result = await issuesApi.list({ ...filters.value, projectId: projectId.value, sort: sort.value, order, limit: limit.value })
  issues.value = result.issues
  total.value = result.total
  isLoading.value = false
}

watch([filters, sort, projectId], () => {
  limit.value = PAGE_SIZE
  selection.clear()
  void fetchIssues()
})
useProjectRealtime(projectId, fetchIssues)

onMounted(async () => {
  void fetchIssues()
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
const applySaved = (criteria: Record<string, string>) => (filters.value = readQuery(criteria))
</script>

<template>
  <div class="space-y-4" :class="isDesktop ? (projectId ? 'px-5 py-4' : 'p-5') : 'p-3'">
    <PageHeader v-if="isDesktop && !projectId" title="All issues" description="Everything across your projects, filtered your way." />

    <!-- Desktop toolbar -->
    <div v-if="isDesktop" class="flex flex-wrap items-start justify-between gap-3">
      <IssueFilterBar v-model="filters" :members="members" :labels="project?.labels" :sprints="sprints" :show-sprint="project?.type === 'scrum'" />
      <div class="flex items-center gap-2">
        <SelectField :model-value="sort" :options="SORT_OPTIONS" size="sm" class="w-48" aria-label="Sort by" @update:model-value="setSort" />
        <SavedFiltersMenu :project-id="projectId" :criteria="filters" @apply="applySaved" />
      </div>
    </div>

    <!-- Mobile toolbar -->
    <div v-else class="flex items-center gap-2">
      <Button variant="outline" size="sm" class="flex-1" @click="isFilterSheetOpen = true">
        <SlidersHorizontal /> Filters<span v-if="activeFilterCount" class="text-primary">({{ activeFilterCount }})</span>
      </Button>
      <SelectField :model-value="sort" :options="SORT_OPTIONS" size="sm" class="flex-1" aria-label="Sort by" @update:model-value="setSort" />
    </div>

    <p class="text-xs text-muted-foreground">{{ total }} issue{{ total === 1 ? '' : 's' }}</p>

    <div v-if="isLoading" class="space-y-2">
      <Skeleton v-for="index in 8" :key="index" class="h-11 w-full" />
    </div>

    <EmptyState
      v-else-if="!issues.length"
      :icon="ListTodo"
      title="No issues match"
      :description="activeFilterCount ? 'Try removing a filter.' : 'Create the first issue to get started.'"
    >
      <Button v-if="activeFilterCount" variant="outline" @click="filters = {}">Clear filters</Button>
      <Button v-else @click="ui.openCreateIssue({ projectId })">Create issue</Button>
    </EmptyState>

    <!-- Desktop: dense table -->
    <div v-else-if="isDesktop" class="overflow-hidden border">
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

    <!-- Mobile: cards -->
    <div v-else class="space-y-2">
      <IssueCard v-for="issue in issues" :key="issue.id" :issue="issue" :show-project="!projectId" show-status @open="openIssue" />
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
          <IssueFilterBar v-model="filters" :members="members" :labels="project?.labels" :sprints="sprints" :show-sprint="project?.type === 'scrum'" stacked />
          <Button class="w-full" @click="isFilterSheetOpen = false">Show {{ total }} results</Button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
