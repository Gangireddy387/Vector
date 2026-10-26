<script setup lang="ts">
import { AlarmClock, CircleCheck, CirclePlus, Gauge, ListTodo, Timer } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DonutChart from '@/components/common/charts/DonutChart.vue'
import HorizontalBarList from '@/components/common/charts/HorizontalBarList.vue'
import LineChart from '@/components/common/charts/LineChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ISSUE_TYPE_META, PRIORITY_META, STATUS_CATEGORY_META } from '@/constants/issue'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { usersApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { UserSummary } from '@/types/models'
import { type ReportFilters, type ReportOverview, reportsApi } from '../reports.api'
import ProjectBreakdownTable from './ProjectBreakdownTable.vue'
import ReportFilterBar from './ReportFilterBar.vue'
import ReportInsights from './ReportInsights.vue'
import ReportKpiCard from './ReportKpiCard.vue'
import SprintReports from './SprintReports.vue'
import WorkloadTable from './WorkloadTable.vue'

/** When set (project "Reports" tab) the report is pinned to that project and the project picker is hidden. */
const props = defineProps<{ lockedProjectId?: string }>()

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()

const queryText = (key: string) => (typeof route.query[key] === 'string' && route.query[key] ? (route.query[key] as string) : undefined)
const PERIODS = [7, 14, 30, 90, 180]

/** Filters live in the URL so a report can be bookmarked or shared. */
const filters = computed<ReportFilters>({
  get: () => ({
    projectId: props.lockedProjectId ?? queryText('project'),
    days: PERIODS.includes(Number(queryText('days'))) ? Number(queryText('days')) : 30,
    assigneeId: queryText('assignee'),
    type: queryText('type'),
    priority: queryText('priority'),
  }),
  set: (next) => {
    const query: Record<string, string> = {}
    if (!props.lockedProjectId && next.projectId) query.project = next.projectId
    if (next.days !== 30) query.days = String(next.days)
    if (next.assigneeId) query.assignee = next.assigneeId
    if (next.type) query.type = next.type
    if (next.priority) query.priority = next.priority
    void router.replace({ query })
  },
})

const report = ref<ReportOverview | null>(null)
const members = ref<UserSummary[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

async function load() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    report.value = await reportsApi.overview(filters.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

watch(filters, load, { immediate: true, deep: true })
watch(
  () => filters.value.projectId,
  async (projectId) => {
    members.value = await usersApi.search({ projectId }).catch(() => [])
  },
  { immediate: true },
)

const singleProject = computed(() => (report.value?.projects.length === 1 ? report.value.projects[0] : null))
const periodLabel = computed(() => {
  const days = filters.value.days
  return days === 180 ? 'last 6 months' : days === 90 ? 'last 3 months' : `last ${days} days`
})

const timelineLabels = computed(() => report.value?.timeline.map((point) => formatDate(point.date, 'd MMM')) ?? [])
const timelineTooltips = computed(
  () =>
    report.value?.timeline.map((point) =>
      point.bucket === 'week' ? `Week of ${formatDate(point.date, 'd MMM')}` : formatDate(point.date, 'EEE, d MMM'),
    ) ?? [],
)

const statusSegments = computed(() => {
  if (!report.value) return []
  if (report.value.byStatus.length) return report.value.byStatus.map((status) => ({ label: status.name, value: status.count, color: status.color }))
  return report.value.byStatusCategory.map((row) => ({ label: STATUS_CATEGORY_META[row.category].label, value: row.count, color: STATUS_CATEGORY_META[row.category].color }))
})
const priorityBars = computed(() =>
  (report.value?.byPriority ?? []).map((row) => ({ label: PRIORITY_META[row.priority].label, value: row.count, color: PRIORITY_META[row.priority].color })),
)
const typeBars = computed(() =>
  (report.value?.byType ?? []).map((row) => ({ label: ISSUE_TYPE_META[row.type].label, value: row.count, color: ISSUE_TYPE_META[row.type].color })),
)

const focusProject = (projectId: string) => (filters.value = { ...filters.value, projectId })
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <ReportFilterBar v-model="filters" :projects="projects.activeProjects" :members="members" :lock-project="Boolean(lockedProjectId)" />
      <p v-if="report" class="text-xs text-muted-foreground">
        {{ formatDate(report.period.from, 'd MMM') }} – {{ formatDate(report.period.to, 'd MMM yyyy') }}
        · {{ report.projects.length === 1 ? report.projects[0]!.name : `${report.projects.length} projects` }}
      </p>
    </div>

    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

    <div v-if="isLoading && !report" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Skeleton v-for="index in 6" :key="index" class="h-32" />
      </div>
      <Skeleton class="h-72 w-full" />
    </div>

    <EmptyState
      v-else-if="report && !report.projects.length"
      title="No projects to report on"
      description="Create or join a project and its numbers will appear here."
      class="py-20"
    />

    <div v-else-if="report" class="space-y-4 transition-opacity" :class="isLoading && 'opacity-60'">
      <!-- Key numbers -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <ReportKpiCard
          label="Open work"
          :value="report.totals.open"
          :icon="ListTodo"
          :explanation="report.totals.openPoints ? `Tasks not done yet · ${report.totals.openPoints} story points.` : 'Tasks that are not done yet.'"
        />
        <ReportKpiCard
          label="Completed"
          :value="report.totals.completedInPeriod"
          :icon="CircleCheck"
          tone="success"
          :change="report.totals.completedChange"
          good-when="up"
          :explanation="`Finished in the ${periodLabel}.`"
        />
        <ReportKpiCard
          label="Created"
          :value="report.totals.createdInPeriod"
          :icon="CirclePlus"
          tone="info"
          :change="report.totals.createdChange"
          good-when="neutral"
          :explanation="`New tasks added in the ${periodLabel}.`"
        />
        <ReportKpiCard
          label="Overdue"
          :value="report.totals.overdue"
          :icon="AlarmClock"
          :tone="report.totals.overdue ? 'danger' : 'default'"
          :explanation="report.totals.dueSoon ? `Past their due date · ${report.totals.dueSoon} more due this week.` : 'Open tasks past their due date.'"
        />
        <ReportKpiCard
          label="Completion"
          :value="`${report.totals.completionRate}%`"
          :icon="Gauge"
          tone="success"
          :explanation="`${report.totals.done} of ${report.totals.total} tasks are done.`"
        />
        <ReportKpiCard
          label="Cycle time"
          :value="report.totals.averageCycleDays === null ? '—' : `${report.totals.averageCycleDays}d`"
          :icon="Timer"
          tone="warning"
          :change="
            report.totals.averageCycleDays !== null && report.totals.previousCycleDays
              ? Math.round(((report.totals.averageCycleDays - report.totals.previousCycleDays) / report.totals.previousCycleDays) * 100)
              : null
          "
          good-when="down"
          explanation="Average days from created to done. Lower is better."
        />
      </div>

      <!-- Trend + what it means -->
      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Created vs. completed</CardTitle>
            <CardDescription>
              When the green line stays above the red one, the team is finishing work faster than it arrives.
              {{ report.timeline[0]?.bucket === 'week' ? 'Each point is one week.' : 'Each point is one day.' }}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              :labels="timelineLabels"
              :tooltip-labels="timelineTooltips"
              :series="[
                { name: 'Created', color: 'var(--destructive)', values: report.timeline.map((point) => point.created) },
                { name: 'Completed', color: 'var(--success)', values: report.timeline.map((point) => point.resolved), area: true },
              ]"
            />
          </CardContent>
        </Card>
        <ReportInsights :insights="report.insights" />
      </div>

      <!-- Projects side by side (all-projects view) -->
      <ProjectBreakdownTable v-if="report.byProject.length > 1" :rows="report.byProject" :days="report.period.days" @select="focusProject" />

      <!-- Breakdowns -->
      <div class="grid items-start gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{{ report.byStatus.length ? 'By status' : 'By stage' }}</CardTitle>
            <CardDescription>
              {{ report.totals.total === 1 ? 'Where the one task is in the workflow.' : `Where all ${report.totals.total} tasks are in the workflow.` }}
            </CardDescription>
          </CardHeader>
          <CardContent><DonutChart :segments="statusSegments" center-label="issues" :size="140" /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open work by priority</CardTitle>
            <CardDescription>How urgent the remaining work is.</CardDescription>
          </CardHeader>
          <CardContent><HorizontalBarList :items="priorityBars" empty-text="No open work" /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By type</CardTitle>
            <CardDescription>The mix of stories, tasks, bugs and more.</CardDescription>
          </CardHeader>
          <CardContent><HorizontalBarList :items="typeBars" empty-text="No tasks" /></CardContent>
        </Card>
      </div>

      <WorkloadTable :rows="report.workload" :days="report.period.days" />

      <!-- Sprint reports for a single scrum project -->
      <template v-if="singleProject?.type === 'scrum'">
        <h2 class="pt-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Sprints · {{ singleProject.name }}</h2>
        <SprintReports :project-id="singleProject.id" />
      </template>
    </div>
  </div>
</template>
