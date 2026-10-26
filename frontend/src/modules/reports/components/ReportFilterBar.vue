<script setup lang="ts">
import { CalendarRange, FolderKanban, RotateCcw, UserRound, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { Project, UserSummary } from '@/types/models'
import type { ReportFilters } from '../reports.api'

const props = defineProps<{ projects: Project[]; members: UserSummary[]; lockProject?: boolean }>()
const filters = defineModel<ReportFilters>({ required: true })

const PERIOD_OPTIONS: SelectFieldOption[] = [7, 14, 30, 90, 180].map((days) => ({
  value: String(days),
  label: days === 180 ? 'Last 6 months' : days === 90 ? 'Last 3 months' : `Last ${days} days`,
  icon: CalendarRange,
}))

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

const isFiltered = computed(
  () => (!props.lockProject && Boolean(filters.value.projectId)) || filters.value.days !== 30 || Boolean(filters.value.assigneeId || filters.value.type || filters.value.priority),
)

function set<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
  filters.value = { ...filters.value, [key]: value }
}

function reset() {
  filters.value = { days: 30, projectId: props.lockProject ? filters.value.projectId : undefined }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Report filters">
    <SelectField
      v-if="!lockProject"
      :model-value="filters.projectId ?? null"
      :options="projectOptions"
      size="sm"
      class="w-52"
      aria-label="Project"
      @update:model-value="(value) => set('projectId', value ?? undefined)"
    />
    <SelectField
      :model-value="String(filters.days)"
      :options="PERIOD_OPTIONS"
      size="sm"
      class="w-44"
      aria-label="Period"
      @update:model-value="(value) => value && set('days', Number(value))"
    />
    <SelectField
      :model-value="filters.assigneeId ?? null"
      :options="assigneeOptions"
      size="sm"
      class="w-48"
      aria-label="Assignee"
      @update:model-value="(value) => set('assigneeId', value ?? undefined)"
    />
    <SelectField
      :model-value="filters.type ?? null"
      :options="typeOptions"
      size="sm"
      class="w-36"
      aria-label="Task type"
      @update:model-value="(value) => set('type', value ?? undefined)"
    />
    <SelectField
      :model-value="filters.priority ?? null"
      :options="priorityOptions"
      size="sm"
      class="w-40"
      aria-label="Priority"
      @update:model-value="(value) => set('priority', value ?? undefined)"
    />
    <Button v-if="isFiltered" variant="ghost" size="sm" @click="reset"><RotateCcw /> Reset</Button>
  </div>
</template>
