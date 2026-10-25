<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown, { type FilterOption } from '@/components/common/FilterDropdown.vue'
import { Button } from '@/components/ui/button'
import { NumberField, SelectField, type SelectFieldOption } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import type { AutomationCondition, ConditionField, ConditionOperator, ProjectDetail, StatusCategory } from '@/types/models'
import {
  CONDITION_FIELD_OPTIONS,
  MULTI_VALUE_OPERATORS,
  OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  VALUELESS_OPERATORS,
} from '../automation.constants'

const props = defineProps<{ project: ProjectDetail }>()
const condition = defineModel<AutomationCondition>({ required: true })
defineEmits<{ remove: [] }>()

const field = computed(() => CONDITION_FIELD_OPTIONS.find((option) => option.value === condition.value.field)!)
const operators = computed(() => OPERATORS_BY_KIND[field.value.kind])
const needsValue = computed(() => !VALUELESS_OPERATORS.includes(condition.value.operator))
const isMulti = computed(() => MULTI_VALUE_OPERATORS.includes(condition.value.operator))
const fieldOptions: SelectFieldOption[] = CONDITION_FIELD_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
const operatorOptions = computed<SelectFieldOption[]>(() => operators.value.map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] })))

const valueOptions = computed<FilterOption[]>(() => {
  switch (field.value.kind) {
    case 'status':
      return props.project.statuses.map((status) => ({ value: status.id, label: status.name, color: status.color }))
    case 'category':
      return (Object.keys(STATUS_CATEGORY_META) as StatusCategory[]).map((category) => ({ value: category, label: STATUS_CATEGORY_META[category].label }))
    case 'type':
      return ISSUE_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, color: ISSUE_TYPE_META[type].color }))
    case 'priority':
      return PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_META[priority].label, color: PRIORITY_META[priority].color }))
    case 'member':
      return props.project.members.map((member) => ({ value: member.id, label: member.name }))
    case 'label':
      return props.project.labels.map((label) => ({ value: label.id, label: label.name, color: label.color }))
    default:
      return []
  }
})

function setField(value: ConditionField) {
  const kind = CONDITION_FIELD_OPTIONS.find((option) => option.value === value)!.kind
  condition.value = { field: value, operator: OPERATORS_BY_KIND[kind][0]!, value: null }
}

function setOperator(value: ConditionOperator) {
  const switchingShape = MULTI_VALUE_OPERATORS.includes(value) !== isMulti.value
  condition.value = { ...condition.value, operator: value, value: switchingShape || VALUELESS_OPERATORS.includes(value) ? null : condition.value.value }
}

const singleValue = computed({
  get: () => (condition.value.value == null || Array.isArray(condition.value.value) ? '' : String(condition.value.value)),
  set: (value: string) => {
    const parsed = field.value.kind === 'number' && value !== '' ? Number(value) : value
    condition.value = { ...condition.value, value: parsed }
  },
})

const multiValue = computed({
  get: () => (Array.isArray(condition.value.value) ? condition.value.value.join(',') : undefined),
  set: (value: string | undefined) => (condition.value = { ...condition.value, value: value ? value.split(',') : [] }),
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border bg-muted/30 p-2">
    <SelectField
      :model-value="condition.field"
      :options="fieldOptions"
      size="sm"
      class="w-44"
      aria-label="Field"
      @update:model-value="(value) => value && setField(value as ConditionField)"
    />
    <SelectField
      :model-value="condition.operator"
      :options="operatorOptions"
      size="sm"
      class="w-40"
      aria-label="Operator"
      @update:model-value="(value) => value && setOperator(value as ConditionOperator)"
    />

    <template v-if="needsValue">
      <FilterDropdown v-if="isMulti" v-model="multiValue" label="Choose values" :options="valueOptions" />
      <SelectField
        v-else-if="valueOptions.length"
        :model-value="singleValue || null"
        :options="valueOptions"
        placeholder="Choose…"
        size="sm"
        class="w-48"
        aria-label="Value"
        @update:model-value="(value) => (singleValue = value ?? '')"
      />
      <NumberField v-else-if="field.kind === 'number'" v-model="singleValue" :min="0" size="sm" class="w-32" aria-label="Value" />
      <Input v-else v-model="singleValue" class="h-8 w-48" placeholder="Value" aria-label="Value" />
    </template>

    <Button variant="ghost" size="icon-sm" class="ml-auto" aria-label="Remove condition" @click="$emit('remove')"><Trash2 /></Button>
  </div>
</template>
