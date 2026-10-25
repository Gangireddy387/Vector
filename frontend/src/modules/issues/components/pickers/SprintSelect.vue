<script setup lang="ts">
import { Archive, Rocket, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { formatDate } from '@/lib/format'
import type { Sprint } from '@/types/models'

const props = withDefaults(defineProps<{ sprints: Sprint[]; size?: 'sm' | 'default'; disabled?: boolean; id?: string }>(), {
  size: 'default',
})
const model = defineModel<string | null>({ default: null })

const options = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'Backlog', icon: Archive, description: 'Not planned yet' },
  ...props.sprints
    .filter((sprint) => sprint.state !== 'completed')
    .map((sprint) => ({
      value: sprint.id,
      label: sprint.name,
      icon: sprint.state === 'active' ? Rocket : Timer,
      iconColor: sprint.state === 'active' ? 'var(--success)' : undefined,
      description:
        sprint.state === 'active'
          ? `Active · ends ${formatDate(sprint.endDate, 'd MMM')}`
          : sprint.startDate
            ? `Planned · starts ${formatDate(sprint.startDate, 'd MMM')}`
            : 'Planned',
    })),
])
</script>

<template>
  <SelectField v-model="model" :options="options" :size="size" :disabled="disabled" :id="id" aria-label="Sprint" />
</template>
