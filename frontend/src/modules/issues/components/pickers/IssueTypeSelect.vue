<script setup lang="ts">
import { computed } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { ISSUE_TYPE_META, ISSUE_TYPES, TOP_LEVEL_ISSUE_TYPES } from '@/constants/issue'
import type { IssueType } from '@/types/models'

const props = withDefaults(defineProps<{ allowSubtask?: boolean; size?: 'sm' | 'default'; disabled?: boolean; id?: string }>(), {
  allowSubtask: false,
  size: 'default',
})
const model = defineModel<IssueType>({ required: true })

const options = computed<SelectFieldOption[]>(() =>
  (props.allowSubtask ? ISSUE_TYPES : TOP_LEVEL_ISSUE_TYPES).map((type) => ({
    value: type,
    label: ISSUE_TYPE_META[type].label,
    icon: ISSUE_TYPE_META[type].icon,
    iconColor: ISSUE_TYPE_META[type].color,
  })),
)
</script>

<template>
  <SelectField
    :model-value="model"
    :options="options"
    :size="size"
    :disabled="disabled"
    :id="id"
    aria-label="Issue type"
    @update:model-value="(value) => value && (model = value as IssueType)"
  />
</template>
