<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { StatusSummary } from '@/types/models'

const props = withDefaults(defineProps<{ status: Pick<StatusSummary, 'name' | 'color'>; size?: 'sm' | 'md'; class?: string }>(), {
  size: 'sm',
})
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex max-w-full items-center gap-1.5 font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-xs',
        props.class,
      )
    "
    :style="{ backgroundColor: `${status.color}1f`, color: status.color }"
  >
    <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: status.color }" />
    <span class="truncate uppercase tracking-wide">{{ status.name }}</span>
  </span>
</template>
