<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown, { type FilterOption } from '@/components/common/FilterDropdown.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import type { Label, Sprint, StatusCategory, UserSummary } from '@/types/models'
import type { IssueFilters } from '../api/issues.api'

export type FilterKey = 'q' | 'assigneeId' | 'statusCategory' | 'type' | 'priority' | 'labelId' | 'sprintId' | 'overdue'

const props = withDefaults(
  defineProps<{ members: UserSummary[]; labels?: Label[]; sprints?: Sprint[]; showSprint?: boolean; stacked?: boolean }>(),
  { labels: () => [], sprints: () => [], showSprint: false, stacked: false },
)
const filters = defineModel<Pick<IssueFilters, FilterKey>>({ required: true })

const set = <K extends FilterKey>(key: K, value: IssueFilters[K]) => (filters.value = { ...filters.value, [key]: value || undefined })

const assigneeOptions = computed<FilterOption[]>(() => [
  { value: 'me', label: 'Me' },
  { value: 'unassigned', label: 'Unassigned' },
  ...props.members.map((member) => ({ value: member.id, label: member.name })),
])
const categoryOptions = (Object.keys(STATUS_CATEGORY_META) as StatusCategory[]).map((category) => ({
  value: category,
  label: STATUS_CATEGORY_META[category].label,
  color: STATUS_CATEGORY_META[category].color,
}))
const typeOptions = ISSUE_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, color: ISSUE_TYPE_META[type].color }))
const priorityOptions = PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_META[priority].label, color: PRIORITY_META[priority].color }))
const labelOptions = computed(() => props.labels.map((label) => ({ value: label.id, label: label.name, color: label.color })))
const sprintOptions = computed(() => [
  { value: 'active', label: 'Active sprint' },
  { value: 'backlog', label: 'Backlog' },
  ...props.sprints.filter((sprint) => sprint.state !== 'completed').map((sprint) => ({ value: sprint.id, label: sprint.name })),
])

const hasFilters = computed(() => Object.values(filters.value).some(Boolean))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" :class="stacked && 'flex-col items-stretch'">
    <div class="relative" :class="stacked ? 'w-full' : 'w-56'">
      <Search class="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        :model-value="filters.q ?? ''"
        placeholder="Search title or key"
        class="h-8 pl-8"
        aria-label="Search issues"
        @update:model-value="(value: string) => set('q', value)"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <FilterDropdown :model-value="filters.assigneeId" label="Assignee" :options="assigneeOptions" @update:model-value="(value) => set('assigneeId', value)" />
      <FilterDropdown :model-value="filters.statusCategory" label="Status" :options="categoryOptions" @update:model-value="(value) => set('statusCategory', value)" />
      <FilterDropdown :model-value="filters.type" label="Type" :options="typeOptions" @update:model-value="(value) => set('type', value)" />
      <FilterDropdown :model-value="filters.priority" label="Priority" :options="priorityOptions" @update:model-value="(value) => set('priority', value)" />
      <FilterDropdown
        v-if="labelOptions.length"
        :model-value="filters.labelId"
        label="Label"
        :options="labelOptions"
        @update:model-value="(value) => set('labelId', value)"
      />
      <FilterDropdown v-if="showSprint" :model-value="filters.sprintId" label="Sprint" :options="sprintOptions" @update:model-value="(value) => set('sprintId', value)" />
      <Button
        variant="outline"
        size="sm"
        :class="filters.overdue && 'border-destructive/50 bg-destructive/5 text-destructive'"
        :aria-pressed="Boolean(filters.overdue)"
        @click="set('overdue', filters.overdue ? undefined : 'true')"
      >
        Overdue
      </Button>
      <Button v-if="hasFilters" variant="ghost" size="sm" @click="filters = {}"><X /> Clear</Button>
    </div>
  </div>
</template>
