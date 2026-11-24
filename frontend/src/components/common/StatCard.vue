<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

/**
 * One figure: a label and a large number, with an optional hint and extra content (e.g. a progress bar).
 * `strip`: a cell in a divided stats strip. `card`: its own card with a coloured icon tile.
 */
withDefaults(
  defineProps<{
    label: string
    value: string | number
    icon?: Component
    hint?: string
    tone?: 'default' | 'danger' | 'warning' | 'success' | 'info'
    variant?: 'strip' | 'card'
  }>(),
  { tone: 'default', variant: 'strip' },
)

const ICON_TONES = {
  default: 'text-primary',
  danger: 'text-destructive',
  warning: 'text-amber-500 dark:text-warning',
  success: 'text-success',
  info: 'text-info',
}

const TILE_TONES = {
  default: 'bg-primary/10 text-primary',
  danger: 'bg-destructive/12 text-destructive',
  warning: 'bg-warning/15 text-amber-600 dark:text-warning',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
}
</script>

<template>
  <div v-if="variant === 'card'" class="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-soft sm:gap-3 sm:p-4">
    <div class="flex items-start justify-between gap-2 sm:gap-3">
      <p class="min-w-0 flex-1 pt-0.5 text-[11px] font-medium leading-snug text-balance text-muted-foreground sm:text-xs">{{ label }}</p>
      <span v-if="icon" :class="cn('flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9', TILE_TONES[tone])">
        <component :is="icon" class="size-4 sm:size-[18px]" />
      </span>
    </div>
    <div class="mt-auto min-w-0">
      <p class="text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl" :class="tone === 'danger' && 'text-destructive'">{{ value }}</p>
      <p v-if="hint" class="mt-1 text-[11px] leading-snug text-pretty text-muted-foreground sm:mt-1.5 sm:text-xs">{{ hint }}</p>
      <slot />
    </div>
  </div>

  <div v-else class="min-w-0 px-4 py-3.5">
    <p class="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground" :title="label">
      <component :is="icon" v-if="icon" :class="cn('size-3.5 shrink-0', ICON_TONES[tone])" />
      {{ label }}
    </p>
    <p class="mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular-nums" :class="tone === 'danger' && 'text-destructive'">{{ value }}</p>
    <p v-if="hint" class="mt-1 truncate text-[11px] text-muted-foreground">{{ hint }}</p>
    <slot />
  </div>
</template>
