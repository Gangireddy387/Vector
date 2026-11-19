<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{ progress: number; size?: 'sm' | 'md' }>(), { size: 'md' })

const clamped = computed(() => Math.max(0, Math.min(100, props.progress || 0)))
const tone = computed(() => {
  if (clamped.value >= 100) return 'bg-emerald-500'
  if (clamped.value >= 60) return 'bg-primary'
  if (clamped.value >= 30) return 'bg-amber-500'
  return 'bg-muted-foreground/50'
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div :class="cn('min-w-0 flex-1 overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2')">
      <div class="h-full rounded-full transition-all" :class="tone" :style="{ width: `${clamped}%` }" />
    </div>
    <span class="shrink-0 tabular-nums text-xs text-muted-foreground">{{ Math.round(clamped) }}%</span>
  </div>
</template>
