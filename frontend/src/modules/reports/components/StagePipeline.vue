<script setup lang="ts">
import { ChevronRight, Hourglass } from 'lucide-vue-next'
import { computed } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProjectProgress } from '../reports.api'

const props = defineProps<{ stages: ProjectProgress['stages']; total: number }>()

/** The open stage where waiting work has been sitting longest. */
const bottleneckId = computed(() => {
  const candidates = props.stages.filter((stage) => stage.category !== 'done' && stage.count && stage.currentAverageAgeDays !== null)
  if (candidates.length < 2) return null
  return [...candidates].sort((a, b) => (b.currentAverageAgeDays ?? 0) - (a.currentAverageAgeDays ?? 0))[0]!.id
})
const days = (value: number | null) => (value === null ? '—' : value < 1 ? '< 1 day' : `${value} day${value === 1 ? '' : 's'}`)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>How work flows through the workflow</CardTitle>
      <CardDescription>
        Where every issue sits today, how long issues usually stay in each stage, and how long the ones waiting now have been there.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Share of issues per stage -->
      <div v-if="total" class="flex h-3 w-full overflow-hidden bg-muted" role="img" aria-label="Issues per stage">
        <span
          v-for="stage in stages.filter((item) => item.count)"
          :key="stage.id"
          class="h-full transition-[width] duration-500"
          :style="{ width: `${(stage.count / total) * 100}%`, backgroundColor: stage.color }"
          :title="`${stage.name}: ${stage.count}`"
        />
      </div>

      <ol class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <template v-for="(stage, index) in stages" :key="stage.id">
          <li
            class="relative flex flex-1 flex-col gap-2 border bg-card p-3"
            :class="stage.id === bottleneckId ? 'border-warning/60 bg-warning/5' : 'border-border/70'"
          >
            <div class="flex items-center gap-2">
              <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: stage.color }" />
              <span class="truncate text-xs font-semibold tracking-wide uppercase">{{ stage.name }}</span>
              <span v-if="stage.id === bottleneckId" class="ml-auto bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-warning">Bottleneck</span>
            </div>
            <p class="text-2xl leading-none font-semibold tabular-nums">
              {{ stage.count }}
              <span class="text-xs font-normal text-muted-foreground">
                {{ stage.count === 1 ? 'issue' : 'issues' }}<template v-if="total"> · {{ Math.round((stage.count / total) * 100) }}%</template>
              </span>
            </p>
            <dl class="space-y-1 text-xs">
              <div class="flex justify-between gap-2">
                <dt class="text-muted-foreground">Usually stays</dt>
                <dd class="font-medium tabular-nums" :title="stage.passes ? `Based on ${stage.passes} moves out of this stage` : 'Appears once issues move out of this stage'">
                  {{ stage.category === 'done' ? '—' : days(stage.averageDaysSpent) }}
                </dd>
              </div>
              <div v-if="stage.category !== 'done'" class="flex justify-between gap-2">
                <dt class="flex items-center gap-1 text-muted-foreground"><Hourglass class="size-3" /> Waiting now</dt>
                <dd class="font-medium tabular-nums" :class="stage.id === bottleneckId && 'text-amber-700 dark:text-warning'">{{ days(stage.currentAverageAgeDays) }}</dd>
              </div>
              <div v-if="stage.points" class="flex justify-between gap-2">
                <dt class="text-muted-foreground">Story points</dt>
                <dd class="font-medium tabular-nums">{{ stage.points }}</dd>
              </div>
              <div v-if="stage.wipLimit !== null" class="flex justify-between gap-2">
                <dt class="text-muted-foreground">WIP limit</dt>
                <dd class="font-medium tabular-nums" :class="stage.count > stage.wipLimit && 'text-destructive'">{{ stage.count }}/{{ stage.wipLimit }}</dd>
              </div>
            </dl>
          </li>
          <li v-if="index < stages.length - 1" class="hidden items-center text-muted-foreground lg:flex" aria-hidden="true">
            <ChevronRight class="size-4" />
          </li>
        </template>
      </ol>
      <p class="text-xs text-muted-foreground">
        “Usually stays” is measured from status changes, so it fills in as issues move across the board. “Waiting now” is the average age of issues currently in a stage.
      </p>
    </CardContent>
  </Card>
</template>
