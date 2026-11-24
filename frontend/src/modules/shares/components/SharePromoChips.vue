<script setup lang="ts">
import { Eye, Lock, MousePointerClick, Sparkles, Zap } from 'lucide-vue-next'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    organizationName?: string
    taskCount?: number
    accessLabel?: string
    /** `strip` = horizontal row; `left` / `right` = stacked side rail. */
    placement?: 'strip' | 'left' | 'right'
  }>(),
  { placement: 'strip' },
)

const chips = computed(() => [
  {
    id: 'live',
    icon: Eye,
    title: props.accessLabel || 'Read-only',
    text: 'Live shared view',
    tone: 'from-sky-400 to-blue-600',
    side: 'left' as const,
  },
  {
    id: 'secure',
    icon: Lock,
    title: 'Secure link',
    text: props.organizationName ? `From ${props.organizationName}` : 'Guest-safe',
    tone: 'from-emerald-400 to-teal-600',
    side: 'left' as const,
  },
  {
    id: 'open',
    icon: MousePointerClick,
    title: 'Open any card',
    text: 'Full task details',
    tone: 'from-violet-400 to-indigo-600',
    side: 'right' as const,
  },
  {
    id: 'ship',
    icon: Zap,
    title: 'Ship together',
    text: props.taskCount ? `${props.taskCount} tasks` : 'Status at a glance',
    tone: 'from-amber-400 to-orange-500',
    side: 'right' as const,
  },
  {
    id: 'vector',
    icon: Sparkles,
    title: 'Powered by Vector',
    text: 'Built to ship',
    tone: 'from-fuchsia-400 to-violet-600',
    side: 'right' as const,
  },
])

const visible = computed(() => {
  if (props.placement === 'left') return chips.value.filter((chip) => chip.side === 'left')
  if (props.placement === 'right') return chips.value.filter((chip) => chip.side === 'right')
  return chips.value
})
</script>

<template>
  <div
    v-if="placement === 'strip'"
    class="flex flex-wrap gap-2"
    aria-hidden="true"
  >
    <span
      v-for="chip in visible"
      :key="chip.id"
      class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1 pr-3 pl-1 shadow-soft"
    >
      <span class="flex size-7 items-center justify-center rounded-full bg-linear-to-br text-white" :class="chip.tone">
        <component :is="chip.icon" class="size-3.5" />
      </span>
      <span class="text-xs font-medium text-foreground">{{ chip.title }}</span>
    </span>
  </div>

  <aside
    v-else
    class="hidden flex-col gap-3 self-start pt-2 lg:flex"
    aria-hidden="true"
  >
    <span
      v-for="(chip, index) in visible"
      :key="chip.id"
      class="share-float flex w-full max-w-[11rem] items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1.5 pr-3 pl-1.5 shadow-soft"
      :style="{ animationDelay: `${0.3 + index * 0.15}s` }"
    >
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-white shadow-sm" :class="chip.tone">
        <component :is="chip.icon" class="size-3.5" />
      </span>
      <span class="min-w-0">
        <span class="block truncate text-[11px] font-semibold text-foreground">{{ chip.title }}</span>
        <span class="block truncate text-[10px] text-muted-foreground">{{ chip.text }}</span>
      </span>
    </span>
  </aside>
</template>

<style scoped>
.share-float {
  animation: share-chip-in 0.5s ease-out both;
}
@keyframes share-chip-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .share-float {
    animation: none;
  }
}
</style>
