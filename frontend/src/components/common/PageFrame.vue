<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Shared page chrome for padded workspace views (desktop/laptop + mobile).
 *
 * Padding follows the app contract without `useDevice`:
 * - phone (&lt;768): `p-3`
 * - workspace (≥768): `p-5`
 * - wide / laptop (≥1024): `p-6` (unless `pad="compact"`)
 *
 * Prefer this over per-page `isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'`.
 */
const props = withDefaults(
  defineProps<{
    /**
     * Layout behaviour:
     * - `stack` — document page (`min-h-full`)
     * - `scroll` — fills a flex parent and scrolls (`flex-1 min-h-0 overflow-y-auto`)
     * - `bare` — width + padding only (caller owns height / overflow / direction)
     */
    mode?: 'stack' | 'scroll' | 'bare'
    /** Vertical rhythm between children. */
    gap?: 'default' | 'compact' | 'none'
    /**
     * Horizontal/vertical page inset.
     * - `none` — fill-height surfaces (board, messages) that own their own chrome padding
     */
    pad?: 'default' | 'compact' | 'none'
    /** Slightly less bottom padding on phone so content clears the floating tab bar. */
    tabClearance?: boolean
    class?: HTMLAttributes['class']
  }>(),
  {
    mode: 'stack',
    gap: 'default',
    pad: 'default',
    tabClearance: false,
  },
)

const frameClass = computed(() =>
  cn(
    'w-full',
    props.mode === 'stack' && 'min-h-full',
    props.mode === 'scroll' && 'min-h-0 flex-1 overflow-y-auto',
    props.gap === 'default' && 'space-y-4 sm:space-y-5',
    props.gap === 'compact' && 'space-y-3',
    props.pad === 'default' && 'p-3 md:p-5 lg:p-6',
    props.pad === 'compact' && 'p-3 md:p-5',
    props.tabClearance && 'max-md:pb-2',
    props.class,
  ),
)
</script>

<template>
  <div data-slot="page-frame" :class="frameClass">
    <slot />
  </div>
</template>
