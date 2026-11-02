<script setup lang="ts">
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { IssuePriority } from '@/types/models'

withDefaults(defineProps<{ size?: 'sm' | 'default'; disabled?: boolean; id?: string }>(), { size: 'default' })
const model = defineModel<IssuePriority>({ required: true })

const OPTIONS: SelectFieldOption[] = PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_META[priority].label,
  icon: PRIORITY_META[priority].icon,
  iconColor: PRIORITY_META[priority].color,
}))
</script>

<template>
  <SelectField
    :id="id"
    :model-value="model"
    :options="OPTIONS"
    :size="size"
    :disabled="disabled"
    aria-label="Priority"
    @update:model-value="(value) => value && (model = value as IssuePriority)"
  />
</template>
