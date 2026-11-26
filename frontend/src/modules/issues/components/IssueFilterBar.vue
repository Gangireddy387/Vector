<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown, { type FilterOption } from '@/components/common/FilterDropdown.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import { useAuthStore } from '@/modules/auth/auth.store'
import {
  CUSTOM_FIELD_KIND,
  OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  VALUELESS_OPERATORS,
  type ValueKind,
} from '@/modules/automation/automation.constants'
import type { Component, ConditionOperator, CustomField, Label, Sprint, StatusCategory, UserSummary } from '@/types/models'
import type { IssueFilters } from '../api/issues.api'

export type FilterKey =
  | 'q'
  | 'assigneeId'
  | 'statusCategory'
  | 'type'
  | 'priority'
  | 'labelId'
  | 'componentId'
  | 'sprintId'
  | 'parentId'
  | 'overdue'
  | 'customFieldId'
  | 'customFieldOp'
  | 'customFieldValue'

const props = withDefaults(
  defineProps<{
    members: UserSummary[]
    labels?: Label[]
    components?: Component[]
    sprints?: Sprint[]
    epics?: Array<{ id: string; key: string; title: string }>
    customFields?: CustomField[]
    showSprint?: boolean
    showEpic?: boolean
    stacked?: boolean
  }>(),
  {
    labels: () => [],
    components: () => [],
    sprints: () => [],
    epics: () => [],
    customFields: () => [],
    showSprint: false,
    showEpic: false,
    stacked: false,
  },
)
const filters = defineModel<Pick<IssueFilters, FilterKey>>({ required: true })

const auth = useAuthStore()
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
const componentOptions = computed(() => [
  { value: 'none', label: 'No component' },
  ...props.components.map((component) => ({ value: component.id, label: component.name, color: component.color })),
])
const sprintOptions = computed(() => [
  { value: 'active', label: 'Active sprint' },
  { value: 'backlog', label: 'Backlog' },
  ...props.sprints.map((sprint) => ({
    value: sprint.id,
    label: sprint.state === 'completed' ? `${sprint.name} (completed)` : sprint.name,
  })),
])
const epicOptions = computed<FilterOption[]>(() => [
  { value: 'none', label: 'No epic' },
  ...props.epics.map((epic) => ({ value: epic.id, label: `${epic.key} · ${epic.title}` })),
])

const showCustomFields = computed(() => auth.hasFeature('customFields') && props.customFields.length > 0)
const selectedCustomField = computed(() => props.customFields.find((field) => field.id === filters.value.customFieldId) ?? null)
const customFieldKind = computed<ValueKind>(() => CUSTOM_FIELD_KIND[selectedCustomField.value?.type ?? 'text'] ?? 'text')
const customFieldOptions = computed<SelectFieldOption[]>(() =>
  props.customFields.map((field) => ({ value: field.id, label: field.name })),
)
const customFieldOpOptions = computed<SelectFieldOption[]>(() =>
  OPERATORS_BY_KIND[customFieldKind.value].map((operator) => ({
    value: operator,
    label: OPERATOR_LABELS[operator],
  })),
)
const customFieldNeedsValue = computed(
  () => Boolean(filters.value.customFieldId) && !VALUELESS_OPERATORS.includes((filters.value.customFieldOp as ConditionOperator) || 'equals'),
)
const customFieldValueOptions = computed<SelectFieldOption[]>(() => {
  if (!selectedCustomField.value) return []
  if (selectedCustomField.value.type === 'checkbox') {
    return [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ]
  }
  if (selectedCustomField.value.type === 'select' || selectedCustomField.value.type === 'multi_select') {
    return (selectedCustomField.value.options ?? []).map((option) => ({ value: option, label: option }))
  }
  return []
})

function setCustomField(fieldId: string | null | undefined) {
  if (!fieldId) {
    filters.value = {
      ...filters.value,
      customFieldId: undefined,
      customFieldOp: undefined,
      customFieldValue: undefined,
    }
    return
  }
  const field = props.customFields.find((entry) => entry.id === fieldId)
  const kind = CUSTOM_FIELD_KIND[field?.type ?? 'text'] ?? 'text'
  const nextOp = OPERATORS_BY_KIND[kind][0] ?? 'equals'
  filters.value = {
    ...filters.value,
    customFieldId: fieldId,
    customFieldOp: nextOp,
    customFieldValue: undefined,
  }
}

function setCustomFieldOp(op: string | null | undefined) {
  if (!op) return
  const needsValue = !VALUELESS_OPERATORS.includes(op as ConditionOperator)
  filters.value = {
    ...filters.value,
    customFieldOp: op,
    customFieldValue: needsValue ? filters.value.customFieldValue : undefined,
  }
}

const hasFilters = computed(() => Object.values(filters.value).some(Boolean))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" :class="stacked && 'flex-col items-stretch'">
    <div class="relative" :class="stacked ? 'w-full' : 'w-56'">
      <Search class="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        :model-value="filters.q ?? ''"
        placeholder="Search title, key or description"
        class="h-8 pl-8"
        aria-label="Search tasks"
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
      <FilterDropdown
        v-if="componentOptions.length > 1"
        :model-value="filters.componentId"
        label="Component"
        :options="componentOptions"
        @update:model-value="(value) => set('componentId', value)"
      />
      <FilterDropdown v-if="showSprint" :model-value="filters.sprintId" label="Sprint" :options="sprintOptions" @update:model-value="(value) => set('sprintId', value)" />
      <FilterDropdown
        v-if="showEpic && epicOptions.length > 1"
        :model-value="filters.parentId"
        label="Epic"
        :options="epicOptions"
        @update:model-value="(value) => set('parentId', value)"
      />
      <template v-if="showCustomFields">
        <SelectField
          :model-value="filters.customFieldId ?? null"
          :options="customFieldOptions"
          placeholder="Custom field…"
          size="sm"
          class="w-40"
          aria-label="Custom field"
          @update:model-value="(value) => setCustomField(value)"
        />
        <SelectField
          v-if="filters.customFieldId"
          :model-value="filters.customFieldOp ?? 'equals'"
          :options="customFieldOpOptions"
          size="sm"
          class="w-36"
          aria-label="Custom field operator"
          @update:model-value="(value) => setCustomFieldOp(value)"
        />
        <SelectField
          v-if="customFieldNeedsValue && customFieldValueOptions.length"
          :model-value="filters.customFieldValue ?? null"
          :options="customFieldValueOptions"
          placeholder="Value…"
          size="sm"
          class="w-36"
          aria-label="Custom field value"
          @update:model-value="(value) => set('customFieldValue', value ?? undefined)"
        />
        <Input
          v-else-if="customFieldNeedsValue"
          :model-value="filters.customFieldValue ?? ''"
          class="h-8 w-36"
          :placeholder="customFieldKind === 'date' ? 'YYYY-MM-DD' : 'Value'"
          aria-label="Custom field value"
          @update:model-value="(value: string) => set('customFieldValue', value)"
        />
      </template>
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
