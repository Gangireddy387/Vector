<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div data-slot="card" :class="cn('flex flex-col gap-4 border border-border/70 bg-card py-4 text-card-foreground shadow-soft', props.class)">
    <slot />
  </div>
</template>
