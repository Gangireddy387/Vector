<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { computed } from 'vue'
import type { Issue, Sprint, UserSummary } from '@/types/models'

/** Matches backend issueEffortMinutes: 4h per story point. */
const MINUTES_PER_POINT = 240

const props = withDefaults(
  defineProps<{
    sprint: Sprint
    issues: Issue[]
    memberCount?: number
    sprintLengthDays?: number
    minutesPerWeek?: number
    averageVelocity?: number | null
  }>(),
  {
    memberCount: 1,
    sprintLengthDays: 14,
    minutesPerWeek: 2400,
    averageVelocity: null,
  },
)

const committed = computed(() => props.issues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0))
const taskCount = computed(() => props.issues.length)

const capacityPoints = computed(() => {
  const people = Math.max(1, props.memberCount)
  const weeks = Math.max(props.sprintLengthDays, 1) / 7
  return Math.round((people * props.minutesPerWeek * weeks) / MINUTES_PER_POINT)
})

const guide = computed(() => {
  const velocity = props.averageVelocity != null && props.averageVelocity > 0 ? Math.round(props.averageVelocity) : null
  if (velocity && capacityPoints.value) return Math.max(velocity, capacityPoints.value)
  return velocity ?? capacityPoints.value
})

const ratio = computed(() => {
  if (!guide.value) return 0
  return Math.min(150, Math.round((committed.value / guide.value) * 100))
})

const overCapacity = computed(() => guide.value > 0 && committed.value > guide.value)

const byAssignee = computed(() => {
  const map = new Map<string, { user: UserSummary | null; points: number; count: number }>()
  for (const issue of props.issues) {
    const key = issue.assigneeId ?? 'unassigned'
    const entry = map.get(key) ?? { user: issue.assignee ?? null, points: 0, count: 0 }
    entry.points += issue.storyPoints ?? 0
    entry.count += 1
    if (issue.assignee) entry.user = issue.assignee
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.points - a.points).slice(0, 6)
})

const perPersonGuide = computed(() => {
  if (!guide.value || props.memberCount <= 0) return 0
  return Math.round(guide.value / Math.max(1, props.memberCount))
})
</script>

<template>
  <div
    class="rounded-xl border px-3 py-2.5 sm:px-4"
    :class="overCapacity ? 'border-destructive/40 bg-destructive/5' : 'bg-card'"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
      <p class="font-medium text-foreground">
        {{ sprint.name }}
        <span class="font-normal text-muted-foreground">capacity</span>
      </p>
      <span class="tabular-nums text-muted-foreground">
        {{ committed }} pts committed
        <template v-if="guide"> · {{ guide }} pts guide</template>
        · {{ taskCount }} tasks
      </span>
      <span
        v-if="overCapacity"
        class="inline-flex items-center gap-1 font-medium text-destructive"
      >
        <AlertTriangle class="size-3.5" /> Over capacity
      </span>
    </div>

    <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full transition-all"
        :class="overCapacity ? 'bg-destructive' : 'bg-primary'"
        :style="{ width: `${Math.min(ratio, 100)}%` }"
      />
    </div>

    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span v-if="capacityPoints">Team capacity ≈ {{ capacityPoints }} pts ({{ memberCount }} × {{ Math.round(minutesPerWeek / 60) }}h/wk × {{ sprintLengthDays }}d)</span>
      <span v-if="averageVelocity">Velocity avg {{ Math.round(averageVelocity) }} pts</span>
      <template v-if="byAssignee.length">
        <span
          v-for="row in byAssignee"
          :key="row.user?.id ?? 'unassigned'"
          class="tabular-nums"
          :class="perPersonGuide && row.points > perPersonGuide ? 'text-amber-700 dark:text-amber-400' : ''"
        >
          {{ row.user?.name ?? 'Unassigned' }} {{ row.points }}pts
        </span>
      </template>
    </div>
  </div>
</template>
