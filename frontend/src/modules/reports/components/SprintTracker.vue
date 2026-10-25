<script setup lang="ts">
import { CalendarCheck, ChevronRight, Gauge, Repeat2, Target, Zap } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import ColumnChart from '@/components/common/charts/ColumnChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import type { SprintProgress, SprintsReport } from '../reports.api'
import ContributorList from './ContributorList.vue'
import ReportKpiCard from './ReportKpiCard.vue'

const props = defineProps<{ report: SprintsReport }>()

const STATE_META: Record<SprintProgress['state'], { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-primary/10 text-primary border-primary/30' },
  planned: { label: 'Upcoming', tone: 'bg-muted text-muted-foreground border-border' },
  completed: { label: 'Completed', tone: 'bg-success/12 text-success border-success/30' },
}

const usePoints = computed(() => props.report.sprints.some((sprint) => sprint.committedPoints > 0))
const chartSprints = computed(() => props.report.sprints.filter((sprint) => sprint.state !== 'planned').slice(0, 10).reverse())
const velocityLabel = computed(() => {
  const { averageDeliveredPoints, averageDelivered } = props.report.totals
  if (usePoints.value) return averageDeliveredPoints === null ? '—' : `${averageDeliveredPoints} pts`
  return averageDelivered === null ? '—' : String(averageDelivered)
})

const expanded = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const dateRange = (sprint: SprintProgress) =>
  sprint.startDate ? `${formatDate(sprint.startDate, 'd MMM')} – ${sprint.endDate ? formatDate(sprint.endDate, 'd MMM yyyy') : 'open-ended'}` : 'Not scheduled'

function timing(sprint: SprintProgress) {
  if (sprint.state === 'active') {
    if (sprint.daysLeft === null) return null
    if (sprint.daysLeft < 0) return { text: `${Math.abs(sprint.daysLeft)} days past the end date`, danger: true }
    return { text: sprint.daysLeft === 0 ? 'Ends today' : `${sprint.daysLeft} days left`, danger: false }
  }
  if (sprint.state === 'completed' && sprint.completedAt) {
    return { text: `Closed ${formatDate(sprint.completedAt, 'd MMM yyyy')}${sprint.finishedLate ? ' · late' : ''}`, danger: sprint.finishedLate }
  }
  return null
}

const committedOf = (sprint: SprintProgress) => (usePoints.value ? sprint.committedPoints : sprint.committed)
const deliveredOf = (sprint: SprintProgress) => (usePoints.value ? sprint.deliveredPoints : sprint.delivered)
const completionTone = (value: number) => (value >= 85 ? 'text-success' : value >= 60 ? 'text-amber-600 dark:text-warning' : 'text-destructive')
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ReportKpiCard label="Sprints completed" :value="report.totals.completed" :icon="CalendarCheck" explanation="Closed sprints since the project started." />
      <ReportKpiCard
        label="Average delivery"
        :value="report.totals.averageCompletion === null ? '—' : `${report.totals.averageCompletion}%`"
        :icon="Target"
        tone="success"
        explanation="Share of committed work finished, per completed sprint."
      />
      <ReportKpiCard label="Average velocity" :value="velocityLabel" :icon="Zap" tone="info" :explanation="usePoints ? 'Story points delivered per sprint.' : 'Issues delivered per sprint.'" />
      <ReportKpiCard
        label="Carried over"
        :value="report.totals.totalCarriedOver"
        :icon="Repeat2"
        :tone="report.totals.totalCarriedOver ? 'warning' : 'default'"
        explanation="Unfinished issues moved on when sprints closed."
      />
    </div>

    <EmptyState
      v-if="!report.sprints.length"
      :icon="Gauge"
      title="No sprints yet"
      description="Plan a sprint from the backlog. Every sprint is tracked here: what it committed to, what it delivered and who delivered it."
      class="border bg-card py-12"
    />

    <template v-else>
      <Card v-if="chartSprints.length">
        <CardHeader>
          <CardTitle>Committed vs. delivered</CardTitle>
          <CardDescription>
            Each pair of bars is one sprint, oldest on the left ({{ usePoints ? 'story points' : 'issues' }}). When the bars match, the team delivered everything it planned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            :labels="chartSprints.map((sprint) => sprint.name)"
            :series="[
              { name: 'Committed', color: 'color-mix(in oklch, var(--primary) 28%, var(--muted))', values: chartSprints.map(committedOf) },
              { name: 'Delivered', color: 'var(--primary)', values: chartSprints.map(deliveredOf) },
            ]"
          />
        </CardContent>
      </Card>

      <section class="border border-border/70 bg-card shadow-soft">
        <header class="border-b px-4 py-3">
          <h2 class="text-sm font-semibold">Every sprint</h2>
          <p class="text-xs text-muted-foreground">Upcoming and active sprints first, then completed ones from newest to oldest. Expand a sprint to see who delivered what.</p>
        </header>
        <ul class="divide-y">
          <li v-for="sprint in report.sprints" :key="sprint.id">
            <div
              role="button"
              tabindex="0"
              class="grid gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/40 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_auto_auto] lg:items-center"
              :aria-expanded="expanded.has(sprint.id)"
              @click="toggle(sprint.id)"
              @keydown.enter.prevent="toggle(sprint.id)"
              @keydown.space.prevent="toggle(sprint.id)"
            >
              <div class="flex min-w-0 items-center gap-2.5">
                <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform" :class="expanded.has(sprint.id) && 'rotate-90'" />
                <div class="min-w-0">
                  <p class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ sprint.name }}</span>
                    <span class="inline-flex shrink-0 border px-1.5 py-px text-[11px] font-semibold" :class="STATE_META[sprint.state].tone">{{ STATE_META[sprint.state].label }}</span>
                  </p>
                  <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{{ dateRange(sprint) }}</span>
                    <span v-if="timing(sprint)" :class="timing(sprint)!.danger && 'font-medium text-destructive'">· {{ timing(sprint)!.text }}</span>
                  </p>
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex h-2 bg-muted">
                  <span class="h-full bg-success transition-[width] duration-500" :style="{ width: `${sprint.completion}%` }" />
                </div>
                <p class="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>
                    <span class="font-semibold text-foreground">{{ sprint.delivered }}</span>/{{ sprint.committed }} issues
                    <template v-if="sprint.committedPoints"> · {{ sprint.deliveredPoints }}/{{ sprint.committedPoints }} pts</template>
                  </span>
                  <span v-if="sprint.carriedOver">{{ sprint.carriedOver }} {{ sprint.state === 'completed' ? 'carried over' : 'left' }}</span>
                </p>
              </div>

              <UserAvatarStack v-if="sprint.contributors.length" :users="sprint.contributors.map((row) => row.user)" :max="4" />
              <span v-else />

              <span class="text-right text-lg font-semibold tabular-nums" :class="sprint.state === 'planned' ? 'text-muted-foreground' : completionTone(sprint.completion)">
                {{ sprint.state === 'planned' ? '—' : `${sprint.completion}%` }}
              </span>
            </div>

            <div v-if="expanded.has(sprint.id)" class="grid gap-4 border-t bg-muted/25 px-4 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:pl-11">
              <div>
                <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Who delivered</h3>
                <ContributorList :contributors="sprint.contributors" />
                <p v-if="sprint.state === 'completed' && sprint.carriedOver" class="mt-3 text-xs text-muted-foreground">
                  Unfinished issues moved to another sprint when this one closed, so only delivered work is listed per person.
                </p>
              </div>
              <div class="space-y-3 text-sm">
                <div v-if="sprint.goal">
                  <p class="text-xs text-muted-foreground">Sprint goal</p>
                  <p class="font-medium">{{ sprint.goal }}</p>
                </div>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div><dt class="text-xs text-muted-foreground">Length</dt><dd class="font-semibold">{{ sprint.durationDays === null ? '—' : `${sprint.durationDays} days` }}</dd></div>
                  <div v-if="sprint.state === 'active'"><dt class="text-xs text-muted-foreground">In progress</dt><dd class="font-semibold tabular-nums">{{ sprint.inProgress }}</dd></div>
                  <div v-else><dt class="text-xs text-muted-foreground">Carried over</dt><dd class="font-semibold tabular-nums">{{ sprint.carriedOver }}</dd></div>
                </dl>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
