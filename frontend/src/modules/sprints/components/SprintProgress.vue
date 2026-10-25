<script setup lang="ts">
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { computed } from 'vue'
import { Progress } from '@/components/ui/progress'
import { formatDate } from '@/lib/format'
import type { Sprint, SprintStats } from '@/types/models'

const props = defineProps<{ sprint: Sprint; stats?: SprintStats | null; inline?: boolean }>()

const stats = computed(() => props.stats ?? props.sprint.stats ?? { issueCount: 0, doneCount: 0, totalPoints: 0, donePoints: 0 })
const percent = computed(() => {
  const { totalPoints, donePoints, issueCount, doneCount } = stats.value
  if (totalPoints) return Math.round((donePoints / totalPoints) * 100)
  return issueCount ? Math.round((doneCount / issueCount) * 100) : 0
})
const daysLeft = computed(() => (props.sprint.endDate ? differenceInCalendarDays(parseISO(props.sprint.endDate), new Date()) : null))
const daysLabel = computed(() => {
  if (daysLeft.value === null) return ''
  if (daysLeft.value < 0) return `${Math.abs(daysLeft.value)} days over`
  if (daysLeft.value === 0) return 'Ends today'
  return `${daysLeft.value} days left`
})
</script>

<template>
  <div v-if="inline" class="flex items-center gap-3 text-xs whitespace-nowrap text-muted-foreground">
    <span>{{ formatDate(sprint.startDate, 'd MMM') }} – {{ formatDate(sprint.endDate, 'd MMM') }}</span>
    <span :class="daysLeft !== null && daysLeft < 0 && 'font-medium text-destructive'">{{ daysLabel }}</span>
    <Progress :model-value="percent" class="h-1.5 w-32" indicator-class="bg-success" />
    <span class="font-medium text-foreground tabular-nums">{{ percent }}%</span>
    <span class="tabular-nums">
      {{ stats.doneCount }}/{{ stats.issueCount }} issues<template v-if="stats.totalPoints"> · {{ stats.donePoints }}/{{ stats.totalPoints }} pts</template>
    </span>
  </div>
  <div v-else class="space-y-1.5">
    <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{{ formatDate(sprint.startDate, 'd MMM') }} – {{ formatDate(sprint.endDate, 'd MMM') }}</span>
      <span :class="daysLeft !== null && daysLeft < 0 && 'font-medium text-destructive'">{{ daysLabel }}</span>
    </div>
    <Progress :model-value="percent" class="h-1.5" indicator-class="bg-success" />
    <p class="text-xs text-muted-foreground">
      {{ percent }}% done · {{ stats.doneCount }}/{{ stats.issueCount }} issues<template v-if="stats.totalPoints"> · {{ stats.donePoints }}/{{ stats.totalPoints }} pts</template>
    </p>
  </div>
</template>
