<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        'flex flex-col gap-4 rounded-2xl border border-border/80 bg-card py-4 text-card-foreground shadow-soft transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
