<script setup lang="ts">
import { computed } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import type { UserSummary } from '@/types/models'

const props = withDefaults(
  defineProps<{
    members: UserSummary[]
    noneLabel?: string
    allowNone?: boolean
    size?: 'sm' | 'default'
    disabled?: boolean
    id?: string
    ariaLabel?: string
  }>(),
  { noneLabel: 'Unassigned', allowNone: true, size: 'default', ariaLabel: 'Assignee' },
)
const model = defineModel<string | null>({ default: null })

const options = computed<SelectFieldOption[]>(() => [
  ...(props.allowNone ? [{ value: null, label: props.noneLabel, user: null }] : []),
  ...props.members.map((member) => ({ value: member.id, label: member.name, description: member.email, user: member })),
])
</script>

<template>
  <SelectField
    v-model="model"
    :options="options"
    :placeholder="noneLabel"
    :size="size"
    :disabled="disabled"
    :id="id"
    :aria-label="ariaLabel"
    search-placeholder="Search people"
    :searchable="members.length > 5"
  />
</template>
