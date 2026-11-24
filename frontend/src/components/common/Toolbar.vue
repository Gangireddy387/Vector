<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, useSlots } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Shared filter / action row for desktop/laptop + mobile.
 *
 * - `stack` — column on phone, row+wrap from `sm` (search + filters)
 * - `wrap` — always a wrapping row (chip / button clusters)
 * - `actions` — CTA cluster; children stretch full-width on phone
 * - `footer` — form footer; primary sits below cancel on phone, right-aligned on desktop
 *
 * Optional `#start` / `#end` slots split a between-justified toolbar without custom flex.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'stack' | 'wrap' | 'actions' | 'footer'
    /** Cross-axis alignment (from `sm` for `stack`; always for other variants). */
    align?: 'start' | 'center' | 'end'
    /** Main-axis distribution (from `sm` for `stack`; always for `wrap` / `actions`). */
    justify?: 'start' | 'between' | 'end'
    dense?: boolean
    class?: HTMLAttributes['class']
  }>(),
  {
    variant: 'stack',
    align: 'center',
    justify: 'start',
    dense: false,
  },
)

const slots = useSlots()
const hasSplit = computed(() => Boolean(slots.start || slots.end))

const alignAlways = computed(
  () =>
    ({
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
    })[props.align],
)

const alignFromSm = computed(
  () =>
    ({
      start: 'sm:items-start',
      center: 'sm:items-center',
      end: 'sm:items-end',
    })[props.align],
)

const justifyAlways = computed(
  () =>
    ({
      start: 'justify-start',
      between: 'justify-between',
      end: 'justify-end',
    })[props.justify],
)

const justifyFromSm = computed(
  () =>
    ({
      start: 'sm:justify-start',
      between: 'sm:justify-between',
      end: 'sm:justify-end',
    })[props.justify],
)

const rootClass = computed(() =>
  cn(
    'w-full',
    props.variant === 'stack' && [
      'flex flex-col',
      props.dense ? 'gap-2' : 'gap-2.5 sm:gap-3',
      'sm:flex-row sm:flex-wrap',
      alignFromSm.value,
      justifyFromSm.value,
    ],
    props.variant === 'wrap' && [
      'flex flex-wrap',
      props.dense ? 'gap-1.5' : 'gap-2',
      alignAlways.value,
      justifyAlways.value,
    ],
    props.variant === 'actions' && [
      'flex shrink-0 flex-wrap',
      props.dense ? 'gap-1.5' : 'gap-2',
      alignAlways.value,
      justifyAlways.value,
      'max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-1',
    ],
    props.variant === 'footer' && [
      'flex flex-col-reverse',
      props.dense ? 'gap-1.5' : 'gap-2',
      'sm:flex-row sm:justify-end',
      'max-sm:[&>*]:w-full',
    ],
    props.class,
  ),
)

const startClass = cn('flex min-w-0 flex-1 flex-wrap items-center gap-2')
/** Stretch end children on phone only for CTA clusters — filter/meta rows should wrap naturally. */
const endClass = computed(() =>
  cn(
    'flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full sm:justify-end',
    props.variant === 'actions' && 'max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-1',
  ),
)
</script>

<template>
  <div data-slot="toolbar" :class="rootClass">
    <template v-if="hasSplit">
      <div v-if="$slots.start" data-slot="toolbar-start" :class="startClass">
        <slot name="start" />
      </div>
      <slot />
      <div v-if="$slots.end" data-slot="toolbar-end" :class="endClass">
        <slot name="end" />
      </div>
    </template>
    <slot v-else />
  </div>
</template>
