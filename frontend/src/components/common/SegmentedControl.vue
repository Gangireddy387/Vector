<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

export interface SegmentedOption {
  value: string
  label: string
  icon?: Component
  count?: number | string
  /** Primary pill for unread-style counts. */
  badge?: boolean
  /** Hide the label text below this Tailwind breakpoint (icon/count still show). */
  labelClass?: string
}

const props = withDefaults(
  defineProps<{
    options: SegmentedOption[]
    size?: 'sm' | 'md'
    ariaLabel?: string
    class?: HTMLAttributes['class']
    /** Stretch options evenly (e.g. 2-col channel tabs). */
    grow?: boolean
  }>(),
  { size: 'md' },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    role="tablist"
    :aria-label="ariaLabel"
    :class="
      cn(
        'inline-flex items-center rounded-md bg-muted p-0.5',
        size === 'sm' ? 'h-7' : 'h-8',
        grow && 'grid w-full',
        props.class,
      )
    "
    :style="grow ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="model === option.value"
      :class="
        cn(
          'inline-flex h-full min-w-0 items-center justify-center gap-1.5 rounded-[5px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          size === 'sm' ? 'px-2.5 text-xs' : 'px-2.5 text-xs sm:px-3',
          model === option.value
            ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]'
            : 'text-muted-foreground hover:text-foreground',
        )
      "
      @click="model = option.value"
    >
      <component :is="option.icon" v-if="option.icon" class="size-3.5 shrink-0" :class="model === option.value && 'text-primary'" />
      <span :class="option.labelClass ?? undefined">{{ option.label }}</span>
      <span
        v-if="option.count != null && option.count !== 0 && option.count !== '0'"
        :class="
          option.badge
            ? 'flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums'
            : 'tabular-nums opacity-70'
        "
      >
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
