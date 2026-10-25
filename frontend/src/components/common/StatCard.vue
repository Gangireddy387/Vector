<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    icon?: Component
    hint?: string
    tone?: 'default' | 'danger' | 'warning' | 'success' | 'info'
  }>(),
  { tone: 'default' },
)

const TONE_CLASSES = {
  default: 'bg-brand text-primary-foreground shadow-glow',
  danger: 'bg-destructive/12 text-destructive ring-1 ring-destructive/15',
  warning: 'bg-warning/15 text-amber-600 ring-1 ring-warning/20 dark:text-warning',
  success: 'bg-success/15 text-success ring-1 ring-success/20',
  info: 'bg-info/15 text-info ring-1 ring-info/20',
}
</script>

<template>
  <div class="surface-hover relative flex items-center gap-3 overflow-hidden border border-border/70 bg-card p-3 shadow-soft">
    <div v-if="icon" :class="cn('flex size-10 shrink-0 items-center justify-center', TONE_CLASSES[tone])">
      <component :is="icon" class="size-5" />
    </div>
    <div class="min-w-0">
      <p class="text-xl leading-none font-semibold tracking-tight tabular-nums">{{ value }}</p>
      <p class="mt-1 truncate text-xs font-medium text-muted-foreground" :title="label">{{ label }}</p>
      <p v-if="hint" class="truncate text-[11px] text-muted-foreground/80">{{ hint }}</p>
    </div>
  </div>
</template>
