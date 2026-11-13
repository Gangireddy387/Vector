<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

/** One figure in a stats strip: a small coloured icon and label above a large number. */
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

const ICON_TONES = {
  default: 'text-primary',
  danger: 'text-destructive',
  warning: 'text-amber-500 dark:text-warning',
  success: 'text-success',
  info: 'text-info',
}
</script>

<template>
  <div class="min-w-0 px-4 py-3.5">
    <p class="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground" :title="label">
      <component :is="icon" v-if="icon" :class="cn('size-3.5 shrink-0', ICON_TONES[tone])" />
      {{ label }}
    </p>
    <p class="mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular-nums" :class="tone === 'danger' && 'text-destructive'">{{ value }}</p>
    <p v-if="hint" class="mt-1 truncate text-[11px] text-muted-foreground">{{ hint }}</p>
    <slot />
  </div>
</template>
