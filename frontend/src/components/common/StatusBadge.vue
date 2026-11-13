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
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card font-medium whitespace-nowrap text-foreground/85',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        props.class,
      )
    "
  >
    <span class="size-2 shrink-0 rounded-full ring-2" :style="{ backgroundColor: status.color, '--tw-ring-color': `${status.color}33` }" />
    <span class="truncate">{{ status.name }}</span>
  </span>
</template>
