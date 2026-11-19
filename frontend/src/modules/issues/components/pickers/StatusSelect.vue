<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { STATUS_CATEGORY_META } from '@/constants/issue'
import { allowedStatusesFor } from '@/lib/workflow-transitions'
import type { Status, WorkflowTransitionRule } from '@/types/models'

const props = withDefaults(
  defineProps<{
    statuses: Status[]
    /** When set with transitions, only allowed targets (plus current) are listed. */
    fromStatusId?: string | null
    transitions?: WorkflowTransitionRule[]
    size?: 'sm' | 'default'
    disabled?: boolean
    id?: string
    class?: string
  }>(),
  { size: 'default' },
)
const model = defineModel<string>({ required: true })

const visibleStatuses = computed(() =>
  allowedStatusesFor(props.statuses, props.transitions, props.fromStatusId ?? model.value),
)

const options = computed<SelectFieldOption[]>(() =>
  visibleStatuses.value.map((status) => ({
    value: status.id,
    label: status.name,
    color: status.color,
    description: STATUS_CATEGORY_META[status.category].label,
  })),
)
const selected = computed(() => props.statuses.find((status) => status.id === model.value))
</script>

<template>
  <SelectField
    :id="id"
    :model-value="model"
    :options="options"
    :size="size"
    :disabled="disabled"
    :class="props.class"
    aria-label="Status"
    @update:model-value="(value) => value && (model = value)"
  >
    <template #value>
      <StatusBadge v-if="selected" :status="selected" size="md" />
      <span v-else class="text-muted-foreground">Select status</span>
    </template>
  </SelectField>
</template>
