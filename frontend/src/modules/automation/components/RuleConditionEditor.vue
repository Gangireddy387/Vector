<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown, { type FilterOption } from '@/components/common/FilterDropdown.vue'
import { Button } from '@/components/ui/button'
import { DateField, NumberField, SelectField, type SelectFieldOption } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/modules/auth/auth.store'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import type { AutomationCondition, ConditionOperator, ProjectDetail, StatusCategory } from '@/types/models'
import {
  CONDITION_FIELD_OPTIONS,
  CUSTOM_FIELD_KIND,
  MULTI_VALUE_OPERATORS,
  OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  VALUELESS_OPERATORS,
  type ValueKind,
} from '../automation.constants'

const props = defineProps<{ project: ProjectDetail }>()
const condition = defineModel<AutomationCondition>({ required: true })
defineEmits<{ remove: [] }>()

const auth = useAuthStore()

const fieldSelectValue = computed(() =>
  condition.value.field === 'customField' && condition.value.customFieldId
    ? `customField:${condition.value.customFieldId}`
    : condition.value.field,
)

const customField = computed(() =>
  condition.value.customFieldId
    ? props.project.customFields?.find((field) => field.id === condition.value.customFieldId) ?? null
    : null,
)

const kind = computed<ValueKind>(() => {
  if (condition.value.field === 'customField') {
    return CUSTOM_FIELD_KIND[customField.value?.type ?? 'text'] ?? 'text'
  }
  return CONDITION_FIELD_OPTIONS.find((option) => option.value === condition.value.field)?.kind ?? 'text'
})

const operators = computed(() => OPERATORS_BY_KIND[kind.value])
const needsValue = computed(() => !VALUELESS_OPERATORS.includes(condition.value.operator))
const isMulti = computed(() => MULTI_VALUE_OPERATORS.includes(condition.value.operator))

const fieldOptions = computed<SelectFieldOption[]>(() => {
  const builtIn = CONDITION_FIELD_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
  if (!auth.hasFeature('customFields')) return builtIn
  const custom = (props.project.customFields ?? []).map((field) => ({
    value: `customField:${field.id}`,
    label: `Custom: ${field.name}`,
  }))
  return [...builtIn, ...custom]
})

const operatorOptions = computed<SelectFieldOption[]>(() =>
  operators.value.map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] })),
)

const valueOptions = computed<FilterOption[]>(() => {
  switch (kind.value) {
    case 'status':
      return props.project.statuses.map((status) => ({ value: status.id, label: status.name, color: status.color }))
    case 'category':
      return (Object.keys(STATUS_CATEGORY_META) as StatusCategory[]).map((category) => ({
        value: category,
        label: STATUS_CATEGORY_META[category].label,
      }))
    case 'type':
      return ISSUE_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, color: ISSUE_TYPE_META[type].color }))
    case 'priority':
      return PRIORITIES.map((priority) => ({
        value: priority,
        label: PRIORITY_META[priority].label,
        color: PRIORITY_META[priority].color,
      }))
    case 'member':
      return props.project.members.map((member) => ({ value: member.id, label: member.name }))
    case 'label':
      return props.project.labels.map((label) => ({ value: label.id, label: label.name, color: label.color }))
    case 'select':
    case 'multi_select':
      return (customField.value?.options ?? []).map((option) => ({ value: option, label: option }))
    case 'checkbox':
      return [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ]
    default:
      return []
  }
})

function setField(raw: string) {
  if (raw.startsWith('customField:')) {
    const customFieldId = raw.slice('customField:'.length)
    const field = props.project.customFields?.find((entry) => entry.id === customFieldId)
    const nextKind = CUSTOM_FIELD_KIND[field?.type ?? 'text'] ?? 'text'
    condition.value = {
      field: 'customField',
      customFieldId,
      operator: OPERATORS_BY_KIND[nextKind][0]!,
      value: null,
    }
    return
  }
  const builtInKind = CONDITION_FIELD_OPTIONS.find((option) => option.value === raw)!.kind
  condition.value = { field: raw as AutomationCondition['field'], customFieldId: null, operator: OPERATORS_BY_KIND[builtInKind][0]!, value: null }
}

function setOperator(value: ConditionOperator) {
  const switchingShape = MULTI_VALUE_OPERATORS.includes(value) !== isMulti.value
  condition.value = {
    ...condition.value,
    operator: value,
    value: switchingShape || VALUELESS_OPERATORS.includes(value) ? null : condition.value.value,
  }
}

const singleValue = computed({
  get: () => {
    if (condition.value.value == null || Array.isArray(condition.value.value)) return ''
    if (typeof condition.value.value === 'boolean') return condition.value.value ? 'true' : 'false'
    return String(condition.value.value)
  },
  set: (value: string) => {
    if (kind.value === 'checkbox') {
      condition.value = { ...condition.value, value: value === 'true' }
      return
    }
    const parsed = kind.value === 'number' && value !== '' ? Number(value) : value
    condition.value = { ...condition.value, value: parsed }
  },
})

const multiValue = computed({
  get: () => (Array.isArray(condition.value.value) ? condition.value.value.join(',') : undefined),
  set: (value: string | undefined) => (condition.value = { ...condition.value, value: value ? value.split(',') : [] }),
})
</script>

<template>
  <div class="flex flex-col gap-2 border bg-muted/30 p-2 sm:flex-row sm:items-center">
    <SelectField
      :model-value="fieldSelectValue"
      :options="fieldOptions"
      size="sm"
      class="w-full sm:w-52 sm:shrink-0"
      aria-label="Field"
      @update:model-value="(value) => value && setField(String(value))"
    />
    <SelectField
      :model-value="condition.operator"
      :options="operatorOptions"
      size="sm"
      class="w-full sm:w-40 sm:shrink-0"
      aria-label="Operator"
      @update:model-value="(value) => value && setOperator(value as ConditionOperator)"
    />

    <div v-if="needsValue" class="min-w-0 w-full sm:w-auto sm:flex-1">
      <FilterDropdown v-if="isMulti" v-model="multiValue" label="Choose values" :options="valueOptions" />
      <SelectField
        v-else-if="valueOptions.length"
        :model-value="singleValue || null"
        :options="valueOptions"
        placeholder="Choose…"
        size="sm"
        class="w-full"
        aria-label="Value"
        @update:model-value="(value) => (singleValue = value ?? '')"
      />
      <NumberField
        v-else-if="kind === 'number'"
        v-model="singleValue"
        :min="0"
        size="sm"
        class="w-full sm:w-32"
        aria-label="Value"
      />
      <DateField v-else-if="kind === 'date'" v-model="singleValue" class="w-full sm:w-40" />
      <Input v-else v-model="singleValue" class="h-10 w-full sm:h-8 sm:max-w-48" placeholder="Value" aria-label="Value" />
    </div>

    <Button variant="ghost" size="icon-lg" class="self-end sm:size-7 sm:self-center" aria-label="Remove condition" @click="$emit('remove')">
      <Trash2 />
    </Button>
  </div>
</template>
