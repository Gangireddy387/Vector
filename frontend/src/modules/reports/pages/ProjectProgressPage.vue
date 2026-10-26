<script setup lang="ts">
import { Boxes, CalendarRange, LayoutDashboard, Users } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LineChart from '@/components/common/charts/LineChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import MilestoneTimeline from '../components/MilestoneTimeline.vue'
import ModuleTracker from '../components/ModuleTracker.vue'
import ProgressSummary from '../components/ProgressSummary.vue'
import SprintTracker from '../components/SprintTracker.vue'
import StagePipeline from '../components/StagePipeline.vue'
import TeamPerformance from '../components/TeamPerformance.vue'
import { type ModulesReport, type ProjectProgress, reportsApi, type SprintsReport } from '../reports.api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const { isDesktop } = useDevice()
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value] ?? null)

type View = 'overview' | 'modules' | 'sprints' | 'team'
const canReviewTeam = computed(() => auth.isOrganizationAdmin || projects.isAdmin(projectId.value))
const views = computed(() => [
  { value: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { value: 'modules' as const, label: 'Modules', icon: Boxes },
  ...(project.value?.type === 'scrum' ? [{ value: 'sprints' as const, label: 'Sprints', icon: CalendarRange }] : []),
  ...(canReviewTeam.value ? [{ value: 'team' as const, label: 'Team', icon: Users }] : []),
])
/** The selected view lives in the URL so admins can link straight to it. */
const view = computed<View>({
  get: () => {
    const requested = route.query.view
    return views.value.some((option) => option.value === requested) ? (requested as View) : 'overview'
  },
  set: (next) => void router.replace({ query: next === 'overview' ? {} : { view: next } }),
})

const progress = ref<ProjectProgress | null>(null)
const modules = ref<ModulesReport | null>(null)
const sprints = ref<SprintsReport | null>(null)
const errorMessage = ref('')
const unit = ref<'issues' | 'points'>('issues')

async function load() {
  errorMessage.value = ''
  try {
    if (view.value === 'overview') progress.value = await reportsApi.progress(projectId.value)
    else if (view.value === 'modules') modules.value = await reportsApi.modules(projectId.value)
    else if (view.value === 'sprints') sprints.value = await reportsApi.sprints(projectId.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  }
}
watch(projectId, () => {
  progress.value = null
  modules.value = null
  sprints.value = null
})
watch([projectId, view], load, { immediate: true })
useProjectRealtime(projectId, load)

const hasPoints = computed(() => Boolean(progress.value?.totals.points))
const burnupSeries = computed(() => {
  const points = progress.value?.burnup ?? []
  const usePoints = unit.value === 'points' && hasPoints.value
  return [
    { name: 'Total scope', color: 'var(--muted-foreground)', values: points.map((point) => (usePoints ? point.scopePoints : point.scope)), dashed: true },
    { name: 'Completed', color: 'var(--success)', values: points.map((point) => (usePoints ? point.completedPoints : point.completed)), area: true },
  ]
})
const burnupLabels = computed(() => progress.value?.burnup.map((point) => formatDate(point.date, 'd MMM')) ?? [])
const burnupTooltips = computed(
  () => progress.value?.burnup.map((point) => (point.bucket === 'week' ? `Week of ${formatDate(point.date, 'd MMM')}` : formatDate(point.date, 'EEE, d MMM'))) ?? [],
)
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? 'px-5 py-4' : 'p-3'">
    <Tabs v-if="views.length > 1" v-model="view">
      <TabsList class="h-9 max-w-full overflow-x-auto">
        <TabsTrigger v-for="option in views" :key="option.value" :value="option.value" class="gap-1.5 px-3">
          <component :is="option.icon" class="size-4" /> {{ option.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

    <template v-if="view === 'overview'">
      <div v-if="!progress && !errorMessage" class="space-y-4">
        <Skeleton class="h-44 w-full" />
        <Skeleton class="h-72 w-full" />
      </div>

      <template v-else-if="progress">
        <ProgressSummary :progress="progress" />

        <EmptyState
          v-if="!progress.totals.issues"
          title="No tasks yet"
          description="Create the first task and this page will track the project's progress from here on."
          class="border bg-card py-12"
        />

        <template v-else>
          <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Progress since the start</CardTitle>
                <CardDescription>
                  The dashed line is all work added to the project; the green area is work completed. When they meet, the project is done. The gap between them
                  is what is left.
                </CardDescription>
                <CardAction v-if="hasPoints">
                  <Tabs v-model="unit">
                    <TabsList class="h-8">
                      <TabsTrigger value="issues" class="text-xs">Tasks</TabsTrigger>
                      <TabsTrigger value="points" class="text-xs">Points</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardAction>
              </CardHeader>
              <CardContent>
                <LineChart :labels="burnupLabels" :tooltip-labels="burnupTooltips" :series="burnupSeries" :height="240" />
              </CardContent>
            </Card>
            <MilestoneTimeline :milestones="progress.milestones" />
          </div>

          <StagePipeline :stages="progress.stages" :total="progress.totals.issues" />
        </template>
      </template>
    </template>

    <template v-else-if="view === 'modules'">
      <ModuleTracker v-if="modules" :report="modules" />
      <Skeleton v-else-if="!errorMessage" class="h-96 w-full" />
    </template>

    <template v-else-if="view === 'sprints'">
      <SprintTracker v-if="sprints" :report="sprints" />
      <Skeleton v-else-if="!errorMessage" class="h-96 w-full" />
    </template>

    <TeamPerformance v-else-if="view === 'team'" :locked-project-id="projectId" />
  </div>
</template>
