<script setup lang="ts">
import { Boxes, CalendarRange, LayoutDashboard, Users } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LineChart from '@/components/common/charts/LineChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileSectionSelect from '@/components/common/MobileSectionSelect.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import { Button } from '@/components/ui/button'
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

/** Stacked CFD: plot cumulative heights; tooltip shows the band (category) counts. */
const cfdSeries = computed(() => {
  const points = progress.value?.cfd ?? []
  return [
    {
      name: 'Done',
      color: 'var(--success)',
      values: points.map((point) => point.todo + point.inProgress + point.done),
      tooltipValues: points.map((point) => point.done),
      area: true,
    },
    {
      name: 'In progress',
      color: 'var(--warning)',
      values: points.map((point) => point.todo + point.inProgress),
      tooltipValues: points.map((point) => point.inProgress),
      area: true,
    },
    {
      name: 'To do',
      color: 'var(--muted-foreground)',
      values: points.map((point) => point.todo),
      tooltipValues: points.map((point) => point.todo),
      area: true,
    },
  ]
})
const cfdLabels = computed(() => progress.value?.cfd.map((point) => formatDate(point.date, 'd MMM')) ?? [])
const cfdTooltips = computed(
  () => progress.value?.cfd.map((point) => (point.bucket === 'week' ? `Week of ${formatDate(point.date, 'd MMM')}` : formatDate(point.date, 'EEE, d MMM'))) ?? [],
)
</script>

<template>
  <PageFrame mode="scroll">
    <MobileSectionSelect v-if="views.length > 1 && !isDesktop" v-model="view" :options="views" aria-label="Progress views" />
    <Tabs v-else-if="views.length > 1" v-model="view">
      <TabsList class="inline-flex h-9 flex-wrap">
        <TabsTrigger v-for="option in views" :key="option.value" :value="option.value" class="gap-1.5 px-3">
          <component :is="option.icon" class="size-4" /> {{ option.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <div v-if="errorMessage" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      <p>{{ errorMessage }}</p>
      <Button variant="outline" size="sm" @click="load">Retry</Button>
    </div>

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
                <EmptyState
                  v-if="!progress.burnup?.length || !progress.totals.done"
                  title="Burnup appears as work completes"
                  description="Complete a few tasks and this chart will show scope versus done over time."
                  class="border-0 py-10 shadow-none"
                />
                <LineChart v-else :labels="burnupLabels" :tooltip-labels="burnupTooltips" :series="burnupSeries" :height="240" />
              </CardContent>
            </Card>
            <MilestoneTimeline :milestones="progress.milestones" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cumulative flow</CardTitle>
              <CardDescription>
                How work sits across To do, In progress and Done over time. A healthy flow grows Done while In progress stays steady.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                v-if="!progress.cfd?.length || !progress.totals.issues"
                title="Flow appears as work moves"
                description="Move tasks through statuses and this chart will show how work accumulates in each stage."
                class="border-0 py-10 shadow-none"
              />
              <LineChart v-else :labels="cfdLabels" :tooltip-labels="cfdTooltips" :series="cfdSeries" :height="240" />
            </CardContent>
          </Card>

          <StagePipeline :stages="progress.stages" :total="progress.totals.issues" />
        </template>
      </template>
    </template>

    <template v-else-if="view === 'modules'">
      <ModuleTracker v-if="modules" :report="modules" />
      <div v-else-if="!errorMessage" class="space-y-4" aria-busy="true" aria-label="Loading modules">
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton v-for="index in 4" :key="index" class="h-24 w-full rounded-xl" />
        </div>
        <div class="overflow-hidden rounded-xl border border-border">
          <Skeleton v-for="index in 5" :key="index" class="h-16 w-full rounded-none border-b border-border/60 last:border-0" />
        </div>
      </div>
    </template>

    <template v-else-if="view === 'sprints'">
      <SprintTracker v-if="sprints" :report="sprints" />
      <div v-else-if="!errorMessage" class="space-y-4" aria-busy="true" aria-label="Loading sprints">
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton v-for="index in 4" :key="index" class="h-24 w-full rounded-xl" />
        </div>
        <div class="overflow-hidden rounded-xl border border-border">
          <Skeleton v-for="index in 5" :key="index" class="h-16 w-full rounded-none border-b border-border/60 last:border-0" />
        </div>
      </div>
    </template>

    <TeamPerformance v-else-if="view === 'team'" :locked-project-id="projectId" />
  </PageFrame>
</template>
