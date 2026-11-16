<script setup lang="ts">
import { ClipboardList, ListTodo, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData }>()
const pulse = computed(() => props.data.weeklyPulse ?? null)
const show = computed(() => Boolean(pulse.value && pulse.value.projectCount > 0))

const standupTone = computed(() => {
  const pct = pulse.value?.standupPct
  if (pct == null) return 'text-muted-foreground'
  if (pct >= 80) return 'text-success'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
})
</script>

<template>
  <section v-if="show && pulse" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="Weekly team pulse">
    <header class="flex h-11 items-center gap-2 border-b border-border px-4">
      <h2 class="text-sm font-semibold">Weekly team pulse</h2>
      <span class="text-xs text-muted-foreground">Last 5 workdays · {{ pulse.projectCount }} project{{ pulse.projectCount === 1 ? '' : 's' }}</span>
      <Button v-if="data.standupRollup?.length" variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
        <RouterLink :to="{ name: 'standup-rollup' }">Standup rollup</RouterLink>
      </Button>
    </header>
    <div class="grid grid-cols-3 divide-x divide-border/70">
      <div class="px-3 py-3 sm:px-4">
        <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><ClipboardList class="size-3.5" /> Standups</p>
        <p class="mt-1 text-lg font-semibold tabular-nums" :class="standupTone">
          {{ pulse.standupPct == null ? '—' : `${pulse.standupPct}%` }}
        </p>
        <p class="text-[11px] text-muted-foreground tabular-nums">
          {{ pulse.standupPosted }}/{{ pulse.standupExpected }} posted
        </p>
      </div>
      <div class="px-3 py-3 sm:px-4">
        <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><ListTodo class="size-3.5" /> Closed</p>
        <p class="mt-1 text-lg font-semibold tabular-nums">{{ pulse.tasksClosed }}</p>
        <p class="text-[11px] text-muted-foreground">tasks this week</p>
      </div>
      <div class="px-3 py-3 sm:px-4">
        <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Video class="size-3.5" /> Actions</p>
        <p class="mt-1 text-lg font-semibold tabular-nums" :class="pulse.meetingActionsOpen ? 'text-primary' : ''">
          {{ pulse.meetingActionsOpen }}
        </p>
        <p class="text-[11px] text-muted-foreground">open from meetings</p>
      </div>
    </div>
  </section>
</template>
