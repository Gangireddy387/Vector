<script setup lang="ts">
import { CalendarClock, CircleAlert, CircleCheck, CirclePause, Rocket, TrendingUp } from 'lucide-vue-next'
import { computed } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { formatDate } from '@/lib/format'
import type { ProjectProgress } from '../reports.api'

const props = defineProps<{ progress: ProjectProgress }>()

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const ringOffset = computed(() => CIRCUMFERENCE * (1 - props.progress.totals.completion / 100))

const startedOn = computed(() => props.progress.milestones.find((milestone) => milestone.kind === 'created')?.date ?? props.progress.project.createdAt)
const age = computed(() => {
  const days = props.progress.ageDays
  if (days < 1) return 'today'
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
})

/** The forecast, explained in one sentence a manager can repeat. */
const verdict = computed(() => {
  const { forecast, totals } = props.progress
  const date = forecast.estimatedDate ? formatDate(forecast.estimatedDate, 'd MMM yyyy') : ''
  switch (forecast.state) {
    case 'complete':
      return { label: 'Complete', icon: CircleCheck, tone: 'bg-success/12 text-success border-success/30', text: `All ${totals.issues} tasks are done. The last one finished on ${date}.` }
    case 'on_track':
      return {
        label: 'On track',
        icon: TrendingUp,
        tone: 'bg-success/12 text-success border-success/30',
        text: `At the current pace of ${forecast.perWeek} tasks a week, the remaining ${totals.open} should be done around ${date}.`,
      }
    case 'at_risk':
      return {
        label: 'At risk',
        icon: CircleAlert,
        tone: 'bg-warning/15 text-amber-700 border-warning/40 dark:text-warning',
        text: `New work arrives faster (${forecast.scopePerWeek}/week) than it is finished (${forecast.perWeek}/week). If no more is added, the remaining ${totals.open} tasks finish around ${date}.`,
      }
    case 'stalled':
      return { label: 'Stalled', icon: CirclePause, tone: 'bg-destructive/10 text-destructive border-destructive/30', text: 'Nothing was completed in the last 4 weeks, so a finish date cannot be estimated yet.' }
    default:
      return { label: 'Not started', icon: Rocket, tone: 'bg-muted text-muted-foreground border-border', text: 'Add tasks to start tracking progress.' }
  }
})
</script>

<template>
  <section class="grid gap-5 border border-border/70 bg-card p-5 shadow-soft lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
    <!-- Completion ring -->
    <div class="flex items-center gap-4">
      <svg viewBox="0 0 120 120" class="size-32 shrink-0 -rotate-90" role="img" :aria-label="`${progress.totals.completion}% complete`">
        <circle cx="60" cy="60" :r="RADIUS" fill="none" stroke="var(--muted)" stroke-width="12" />
        <circle
          cx="60"
          cy="60"
          :r="RADIUS"
          fill="none"
          stroke="var(--success)"
          stroke-width="12"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="ringOffset"
          class="transition-[stroke-dashoffset] duration-700"
        />
        <g class="rotate-90" style="transform-origin: 60px 60px">
          <text x="60" y="60" text-anchor="middle" class="fill-foreground text-[24px] font-semibold">{{ progress.totals.completion }}%</text>
          <text x="60" y="78" text-anchor="middle" class="fill-muted-foreground text-[10px]">complete</text>
        </g>
      </svg>
      <div class="space-y-1 lg:hidden">
        <p class="text-sm font-semibold">{{ progress.totals.done }} of {{ progress.totals.issues }} tasks done</p>
      </div>
    </div>

    <!-- Facts -->
    <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <div>
        <dt class="text-xs text-muted-foreground">Tasks done</dt>
        <dd class="font-semibold tabular-nums">{{ progress.totals.done }} <span class="font-normal text-muted-foreground">of {{ progress.totals.issues }}</span></dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Story points done</dt>
        <dd class="font-semibold tabular-nums">
          <template v-if="progress.totals.points">
            {{ progress.totals.donePoints }} <span class="font-normal text-muted-foreground">of {{ progress.totals.points }} ({{ progress.totals.pointsCompletion }}%)</span>
          </template>
          <span v-else class="font-normal text-muted-foreground">Not estimated</span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Started</dt>
        <dd class="font-semibold">{{ formatDate(startedOn, 'd MMM yyyy') }} <span class="font-normal text-muted-foreground">· {{ age }}</span></dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Average time to finish a task</dt>
        <dd class="font-semibold tabular-nums">{{ progress.totals.averageLeadTimeDays === null ? '—' : `${progress.totals.averageLeadTimeDays} days` }}</dd>
      </div>
      <div v-if="progress.project.lead" class="col-span-2">
        <dt class="text-xs text-muted-foreground">Project lead</dt>
        <dd class="flex items-center gap-2 font-medium"><UserAvatar :user="progress.project.lead" size="xs" /> {{ progress.project.lead.name }}</dd>
      </div>
    </dl>

    <!-- Forecast -->
    <div class="space-y-2 border-l-0 lg:border-l lg:pl-5">
      <p class="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><CalendarClock class="size-3.5" /> Forecast</p>
      <span class="inline-flex items-center gap-1.5 border px-2 py-1 text-sm font-semibold" :class="verdict.tone">
        <component :is="verdict.icon" class="size-4" /> {{ verdict.label }}
        <template v-if="progress.forecast.estimatedDate && progress.forecast.state !== 'complete'"> · {{ formatDate(progress.forecast.estimatedDate, 'd MMM yyyy') }}</template>
      </span>
      <p class="text-sm leading-relaxed text-muted-foreground">{{ verdict.text }}</p>
    </div>
  </section>
</template>
