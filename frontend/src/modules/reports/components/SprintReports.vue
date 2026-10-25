<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ColumnChart from '@/components/common/charts/ColumnChart.vue'
import LineChart from '@/components/common/charts/LineChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { SelectField } from '@/components/forms'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Sprint } from '@/types/models'
import { type BurndownReport, reportsApi, type VelocityReport } from '../reports.api'

const props = defineProps<{ projectId: string }>()

const sprints = ref<Sprint[]>([])
const velocity = ref<VelocityReport | null>(null)
const burndown = ref<BurndownReport | null>(null)
const selectedSprintId = ref('')

watch(
  () => props.projectId,
  async (projectId) => {
    const [sprintList, velocityReport] = await Promise.all([sprintsApi.list(projectId), reportsApi.velocity(projectId)])
    sprints.value = sprintList.filter((sprint) => sprint.state !== 'planned')
    velocity.value = velocityReport
    selectedSprintId.value = sprints.value.find((sprint) => sprint.state === 'active')?.id ?? sprints.value[0]?.id ?? ''
  },
  { immediate: true },
)
watch(selectedSprintId, async (sprintId) => {
  burndown.value = sprintId ? await reportsApi.burndown(props.projectId, sprintId) : null
})

const sprintOptions = computed(() =>
  sprints.value.map((sprint) => ({ value: sprint.id, label: sprint.name, description: sprint.state === 'active' ? 'Active' : 'Completed' })),
)

/** Plain-language status of the selected sprint: ahead of or behind the ideal line today. */
const burndownVerdict = computed(() => {
  const points = burndown.value?.points ?? []
  const today = [...points].reverse().find((point) => point.remaining !== null)
  if (!today || !burndown.value) return ''
  const difference = Math.round((today.remaining! - today.ideal) * 10) / 10
  const unit = burndown.value.unit
  if (difference > 0) return `Behind plan: ${difference} ${unit} more remaining than the ideal line today.`
  if (difference < 0) return `Ahead of plan: ${Math.abs(difference)} ${unit} fewer remaining than the ideal line today.`
  return 'Right on plan today.'
})
</script>

<template>
  <div class="grid items-start gap-4 xl:grid-cols-2">
    <Card>
      <CardHeader>
        <CardTitle>Sprint burndown</CardTitle>
        <CardDescription>
          <template v-if="burndown">How much work is left each day ({{ burndown.unit }}) compared with an even pace. {{ burndownVerdict }}</template>
          <template v-else>Remaining work per day in the selected sprint.</template>
        </CardDescription>
        <CardAction>
          <SelectField
            v-if="sprints.length"
            :model-value="selectedSprintId"
            :options="sprintOptions"
            size="sm"
            class="w-48"
            align="end"
            aria-label="Sprint"
            @update:model-value="(value) => value && (selectedSprintId = value)"
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <LineChart
          v-if="burndown"
          :labels="burndown.points.map((point) => formatDate(point.date, 'd MMM'))"
          :tooltip-labels="burndown.points.map((point) => formatDate(point.date, 'EEE, d MMM'))"
          :series="[
            { name: 'Ideal pace', color: 'var(--muted-foreground)', values: burndown.points.map((point) => point.ideal), dashed: true },
            { name: 'Remaining', color: 'var(--primary)', values: burndown.points.map((point) => point.remaining), area: true },
          ]"
        />
        <EmptyState v-else title="No sprint data yet" description="Start a sprint to see its burndown." class="py-8" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Velocity</CardTitle>
        <CardDescription>
          <template v-if="velocity?.sprints.length">
            Points committed vs. completed per sprint. On average the team completes {{ velocity.averageVelocity }} points, so plan sprints around that.
          </template>
          <template v-else>Points committed vs. completed in each finished sprint.</template>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ColumnChart
          v-if="velocity?.sprints.length"
          :labels="velocity.sprints.map((sprint) => sprint.name)"
          :series="[
            { name: 'Committed', color: 'color-mix(in oklch, var(--primary) 28%, var(--muted))', values: velocity.sprints.map((sprint) => sprint.committed) },
            { name: 'Completed', color: 'var(--primary)', values: velocity.sprints.map((sprint) => sprint.completed) },
          ]"
        />
        <EmptyState v-else title="No completed sprints yet" description="Velocity appears after your first completed sprint." class="py-8" />
      </CardContent>
    </Card>
  </div>
</template>
