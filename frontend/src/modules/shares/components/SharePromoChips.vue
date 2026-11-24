<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    organizationName?: string
    taskCount?: number
    accessLabel?: string
    /** Kept for call-site compatibility; strip is the only public layout now. */
    placement?: 'strip' | 'left' | 'right'
  }>(),
  { placement: 'strip' },
)
</script>

<template>
  <!-- One quiet brand line — no floating pill clusters beside the board. -->
  <div
    v-if="placement === 'strip'"
    class="share-promo flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-soft backdrop-blur-sm"
  >
    <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
      <span class="flex size-5 items-center justify-center rounded-md bg-brand text-white shadow-glow">
        <Sparkles class="size-3" />
      </span>
      <span class="text-brand font-semibold">Vector</span>
    </span>
    <span class="hidden h-3 w-px bg-border/80 sm:block" aria-hidden="true" />
    <span v-if="organizationName" class="truncate">Shared by {{ organizationName }}</span>
    <span v-if="taskCount != null" class="tabular-nums">{{ taskCount }} {{ taskCount === 1 ? 'task' : 'tasks' }}</span>
    <span v-if="accessLabel" class="ml-auto font-medium text-foreground/80">{{ accessLabel }}</span>
  </div>
</template>
