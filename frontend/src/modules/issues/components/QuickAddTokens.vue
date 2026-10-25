<script setup lang="ts">
import { AtSign, CalendarDays, Flag, Hash, Shapes, Target } from 'lucide-vue-next'
import { describeDue } from '@/lib/format'
import type { QuickAddToken } from '@/lib/quick-add-parser'

defineProps<{ tokens: QuickAddToken[] }>()

const ICONS = { assignee: AtSign, label: Hash, priority: Flag, due: CalendarDays, points: Target, type: Shapes }

const labelFor = (token: QuickAddToken) => (token.kind === 'due' ? describeDue(token.display) : token.display)
</script>

<template>
  <div v-if="tokens.length" class="flex flex-wrap gap-1.5" aria-live="polite">
    <span
      v-for="token in tokens"
      :key="token.raw"
      class="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
      :class="token.kind === 'priority' || token.kind === 'type' ? 'capitalize' : ''"
    >
      <component :is="ICONS[token.kind]" class="size-3" />
      {{ labelFor(token) }}
    </span>
  </div>
</template>
