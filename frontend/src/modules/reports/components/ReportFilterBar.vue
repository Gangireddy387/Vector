<script setup lang="ts">
import { CalendarRange, FolderKanban, RotateCcw, UserRound, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { DatePicker, SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { useDevice } from '@/composables/useDevice'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { Project, UserSummary } from '@/types/models'
import type { ReportFilters } from '../reports.api'

const props = defineProps<{ projects: Project[]; members: UserSummary[]; lockProject?: boolean }>()
const filters = defineModel<ReportFilters>({ required: true })
const { isDesktop, isWide } = useDevice()

const PERIOD_OPTIONS: SelectFieldOption[] = [
  ...[7, 14, 30, 90, 180].map((days) => ({
    value: String(days),
    label: days === 180 ? 'Last 6 months' : days === 90 ? 'Last 3 months' : `Last ${days} days`,
    icon: CalendarRange,
  })),
  { value: 'custom', label: 'Custom range…', icon: CalendarRange },
]

const projectOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'All projects', icon: FolderKanban },
  ...props.projects.map((project) => ({ value: project.id, label: project.name, description: project.key, color: project.color })),
])
const assigneeOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'Everyone', icon: Users },
  { value: 'me', label: 'Assigned to me', icon: UserRound },
  { value: 'unassigned', label: 'Unassigned', user: null },
  ...props.members.map((member) => ({ value: member.id, label: member.name, user: member })),
])
const typeOptions: SelectFieldOption[] = [
  { value: null, label: 'All types' },
  ...ISSUE_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, icon: ISSUE_TYPE_META[type].icon, iconColor: ISSUE_TYPE_META[type].color })),
]
const priorityOptions: SelectFieldOption[] = [
  { value: null, label: 'All priorities' },
  ...PRIORITIES.map((priority) => ({
    value: priority,
    label: PRIORITY_META[priority].label,
    icon: PRIORITY_META[priority].icon,
    iconColor: PRIORITY_META[priority].color,
  })),
]

const isCustom = computed(() => Boolean(filters.value.from && filters.value.to))
const periodValue = computed(() => (isCustom.value ? 'custom' : String(filters.value.days)))

const isFiltered = computed(
  () =>
    (!props.lockProject && Boolean(filters.value.projectId)) ||
    filters.value.days !== 30 ||
    isCustom.value ||
    Boolean(filters.value.assigneeId || filters.value.type || filters.value.priority),
)

function set<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
  filters.value = { ...filters.value, [key]: value }
}

function setPeriod(value?: string | null) {
  if (!value) return
  if (value === 'custom') {
    const to = filters.value.to ?? new Date().toISOString().slice(0, 10)
    const from =
      filters.value.from ??
      new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    filters.value = { ...filters.value, from, to }
    return
  }
  filters.value = { ...filters.value, days: Number(value), from: undefined, to: undefined }
}

function setCustomDate(key: 'from' | 'to', value: string) {
  if (!value) return
  const next = { ...filters.value, [key]: value }
  if (next.from && next.to && next.from > next.to) {
    if (key === 'from') next.to = value
    else next.from = value
  }
  filters.value = next
}

function reset() {
  filters.value = {
    days: 30,
    projectId: props.lockProject ? filters.value.projectId : undefined,
    from: undefined,
    to: undefined,
  }
}
</script>

<template>
  <div
    class="flex gap-2"
    :class="isDesktop ? 'flex-wrap items-center' : 'w-full flex-col'"
    role="group"
    aria-label="Report filters"
  >
    <SelectField
      v-if="!lockProject"
      :model-value="filters.projectId ?? null"
      :options="projectOptions"
      size="sm"
      class="max-sm:w-full sm:w-52"
      aria-label="Project"
      @update:model-value="(value) => set('projectId', value ?? undefined)"
    />
    <SelectField
      :model-value="periodValue"
      :options="PERIOD_OPTIONS"
      size="sm"
      class="max-sm:w-full sm:w-44"
      aria-label="Period"
      @update:model-value="setPeriod"
    />
    <template v-if="isCustom">
      <DatePicker
        :model-value="filters.from!"
        size="sm"
        class="max-sm:w-full sm:w-40"
        :clearable="false"
        display-format="d MMM yyyy"
        aria-label="From"
        @update:model-value="(value) => value && setCustomDate('from', value)"
      />
      <span class="hidden text-xs text-muted-foreground sm:inline">to</span>
      <DatePicker
        :model-value="filters.to!"
        size="sm"
        class="max-sm:w-full sm:w-40"
        :clearable="false"
        display-format="d MMM yyyy"
        aria-label="To"
        @update:model-value="(value) => value && setCustomDate('to', value)"
      />
    </template>
    <SelectField
      :model-value="filters.assigneeId ?? null"
      :options="assigneeOptions"
      size="sm"
      class="max-sm:w-full sm:w-48"
      aria-label="Assignee"
      @update:model-value="(value) => set('assigneeId', value ?? undefined)"
    />
    <SelectField
      v-if="isWide || filters.type"
      :model-value="filters.type ?? null"
      :options="typeOptions"
      size="sm"
      class="max-sm:w-full sm:w-36"
      aria-label="Task type"
      @update:model-value="(value) => set('type', value ?? undefined)"
    />
    <SelectField
      v-if="isWide || filters.priority"
      :model-value="filters.priority ?? null"
      :options="priorityOptions"
      size="sm"
      class="max-sm:w-full sm:w-40"
      aria-label="Priority"
      @update:model-value="(value) => set('priority', value ?? undefined)"
    />
    <Button v-if="isFiltered" variant="ghost" size="sm" :class="!isDesktop && 'w-full'" @click="reset"><RotateCcw /> Reset</Button>
  </div>
</template>
