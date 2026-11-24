<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, useSlots } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { cn } from '@/lib/utils'

/**
 * Master / detail layout aligned with `useDevice` (≥1024 = wide):
 *
 * | Viewport | No selection | Selection |
 * |----------|--------------|-----------|
 * | Wide     | master + detail/empty | both panes |
 * | Narrow   | master only  | detail only (stack / nav) |
 *
 * Set `requireSelection` for inbox-style layouts: the detail column only
 * appears after a choice, and the master expands to full width until then.
 */
const props = withDefaults(
  defineProps<{
    /** When true, the detail pane is active (narrow screens hide the master). */
    selected?: boolean
    /**
     * When true, detail only mounts after `selected` — even on wide screens.
     * Master stays full-width until something is chosen (Inbox).
     */
    requireSelection?: boolean
    /**
     * Hide the master column on wide screens (e.g. Wiki reading mode).
     * Ignored when nothing is selected so the list stays reachable.
     */
    collapsed?: boolean
    /** Width classes for the master column when split side-by-side. */
    masterClass?: HTMLAttributes['class']
    detailClass?: HTMLAttributes['class']
    class?: HTMLAttributes['class']
  }>(),
  {
    selected: false,
    requireSelection: false,
    collapsed: false,
    /** Matches Messages / Inbox list density on laptop. */
    masterClass: 'w-[min(22rem,36%)] shrink-0 xl:w-[26rem]',
  },
)

const slots = useSlots()
const { isWide } = useDevice()

/** Side-by-side master + detail (or empty) on wide screens. */
const sideBySide = computed(
  () => isWide.value && !props.collapsed && (props.selected || !props.requireSelection),
)

const showMaster = computed(() => {
  if (props.collapsed && isWide.value && props.selected) return false
  return isWide.value || !props.selected
})
const showDetail = computed(() => (props.requireSelection ? props.selected : isWide.value || props.selected))
const showEmpty = computed(
  () => !props.requireSelection && Boolean(slots.empty) && isWide.value && !props.selected && !props.collapsed,
)

const rootClass = computed(() => cn('flex min-h-0 w-full flex-1 overflow-hidden', props.class))

const masterPaneClass = computed(() =>
  cn(
    'flex min-h-0 min-w-0 flex-col border-border bg-background',
    sideBySide.value ? cn(props.masterClass, 'border-r') : 'w-full flex-1',
  ),
)

const detailPaneClass = computed(() => cn('flex min-h-0 min-w-0 flex-1 flex-col', props.detailClass))
</script>

<template>
  <div data-slot="split-pane" :class="rootClass">
    <!-- v-show keeps list scroll position when returning from detail on phone -->
    <aside v-show="showMaster" data-slot="split-pane-master" :class="masterPaneClass">
      <slot name="master" :wide="isWide" :selected="selected" />
    </aside>

    <section v-if="showDetail" data-slot="split-pane-detail" :class="detailPaneClass">
      <slot v-if="showEmpty" name="empty" :wide="isWide" />
      <slot v-else name="detail" :wide="isWide" :selected="selected" />
    </section>
  </div>
</template>
