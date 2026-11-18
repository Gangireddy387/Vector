<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="skeleton"
    role="presentation"
    aria-hidden="true"
    :class="
      cn(
        'skeleton-shimmer relative overflow-hidden rounded-md bg-muted',
        props.class,
      )
    "
  />
</template>
