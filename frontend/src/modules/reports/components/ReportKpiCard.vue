<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-vue-next'
import { type Component, computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    /** One short sentence that explains the number in plain words. */
    explanation: string
    icon: Component
    /** Percentage change vs. the previous period; null hides the badge. */
    change?: number | null
    /** Which direction is good news for this metric. */
    goodWhen?: 'up' | 'down' | 'neutral'
    tone?: 'default' | 'danger' | 'success' | 'warning' | 'info'
  }>(),
  { change: null, goodWhen: 'up', tone: 'default' },
)

const TONES = {
  default: 'bg-primary/10 text-primary',
  danger: 'bg-destructive/12 text-destructive',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-amber-600 dark:text-warning',
  info: 'bg-info/15 text-info',
}

const changeTone = computed(() => {
  if (props.change === null || props.change === 0 || props.goodWhen === 'neutral') return 'bg-muted text-muted-foreground'
  const isGood = props.goodWhen === 'up' ? props.change > 0 : props.change < 0
  return isGood ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive'
})
</script>

<template>
  <div class="flex flex-col gap-3 border border-border/70 bg-card p-4 shadow-soft">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-muted-foreground">{{ label }}</span>
      <span :class="cn('flex size-8 shrink-0 items-center justify-center', TONES[tone])"><component :is="icon" class="size-4" /></span>
    </div>
    <div class="flex items-end gap-2">
      <span class="text-2xl leading-none font-semibold tracking-tight tabular-nums">{{ value }}</span>
      <span
        v-if="change !== null"
        :class="cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', changeTone)"
        :title="'Compared with the previous period'"
      >
        <ArrowUpRight v-if="change > 0" class="size-3" />
        <ArrowDownRight v-else-if="change < 0" class="size-3" />
        <Minus v-else class="size-3" />
        {{ Math.abs(change) }}%
      </span>
    </div>
    <p class="text-xs leading-snug text-muted-foreground">{{ explanation }}</p>
  </div>
</template>
