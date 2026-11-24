<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Dense data: card list on smaller screens, real `<table>` on large laptops/desktops.
 *
 * Default breakpoint is Tailwind `xl` (1280px) — same as existing report tables —
 * because multi-column grids need more room than `isWide` (1024) side panes.
 * Use `breakpoint="lg"` for simpler 3–4 column tables.
 *
 * Slots:
 * - `#list` — stacked cards / rows (shown below the breakpoint)
 * - `#table` — `<table>` (or table wrapper contents; overflow is applied here)
 */
const props = withDefaults(
  defineProps<{
    breakpoint?: 'lg' | 'xl'
    class?: HTMLAttributes['class']
    listClass?: HTMLAttributes['class']
    tableClass?: HTMLAttributes['class']
  }>(),
  { breakpoint: 'xl' },
)

const listVisibility = computed(() => (props.breakpoint === 'lg' ? 'lg:hidden' : 'xl:hidden'))
const tableVisibility = computed(() => (props.breakpoint === 'lg' ? 'hidden lg:block' : 'hidden xl:block'))
</script>

<template>
  <div data-slot="responsive-table" :class="cn(props.class)">
    <div data-slot="responsive-table-list" :class="cn(listVisibility, props.listClass)">
      <slot name="list" />
    </div>
    <div data-slot="responsive-table-table" :class="cn(tableVisibility, 'overflow-x-auto', props.tableClass)">
      <slot name="table" />
    </div>
  </div>
</template>
