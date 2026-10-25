<script setup lang="ts">
import { CalendarDays } from 'lucide-vue-next'
import { computed } from 'vue'
import { describeDue, formatDate, getDueState } from '@/lib/format'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{ dueDate: string | null; done?: boolean; compact?: boolean }>(), {
  done: false,
  compact: false,
})

const state = computed(() => getDueState(props.dueDate, props.done))
const STATE_CLASSES = {
  overdue: 'bg-destructive/10 text-destructive',
  today: 'bg-warning/20 text-amber-700 dark:text-warning',
  soon: 'bg-warning/10 text-amber-700 dark:text-warning',
  later: 'text-muted-foreground',
  none: 'text-muted-foreground',
}
const text = computed(() => (props.compact ? formatDate(props.dueDate, 'd MMM') : describeDue(props.dueDate)))
</script>

<template>
  <span
    v-if="dueDate"
    :class="cn('inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', STATE_CLASSES[state])"
    :title="`Due ${formatDate(dueDate)}`"
  >
    <CalendarDays class="size-3" />
    {{ text }}
  </span>
</template>
