<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  /** Stagger index for shimmer delay (70ms steps). */
  delay?: number
}>()

const shimmerStyle = computed(() =>
  props.delay != null && props.delay > 0 ? { animationDelay: `${props.delay * 70}ms` } : undefined,
)
</script>

<template>
  <div
    data-slot="skeleton"
    role="presentation"
    aria-hidden="true"
    :style="shimmerStyle"
    :class="
      cn(
        'skeleton-shimmer relative overflow-hidden rounded-md bg-muted',
        props.class,
      )
    "
  />
</template>
