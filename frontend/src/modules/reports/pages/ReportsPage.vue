<script setup lang="ts">
import { BarChart3, Clock3, Gauge, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDevice } from '@/composables/useDevice'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import CapacityPanel from '../components/CapacityPanel.vue'
import ReportsDashboard from '../components/ReportsDashboard.vue'
import TeamPerformance from '../components/TeamPerformance.vue'
import TimeReportPanel from '../components/TimeReportPanel.vue'

/** Serves both /reports (all projects) and the project "Reports" tab (pinned to that project). */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const { isDesktop } = useDevice()
const projectId = computed(() => (typeof route.params.projectId === 'string' ? route.params.projectId : undefined))

/** Workspace admins review everyone; project admins review the people in their projects. */
const canReviewTeam = computed(
  () => !projectId.value && (auth.isOrganizationAdmin || projects.activeProjects.some((project) => project.myRole === 'admin')),
)

const showTime = computed(() => auth.hasFeature('timeTracking'))

type ReportTab = 'overview' | 'capacity' | 'team' | 'time'
const tab = computed({
  get: (): ReportTab => {
    if (route.query.tab === 'capacity') return 'capacity'
    if (showTime.value && route.query.tab === 'time') return 'time'
    if (canReviewTeam.value && route.query.tab === 'team') return 'team'
    return 'overview'
  },
  set: (next: string) => {
    const query = next === 'overview' ? {} : { tab: next }
    void router.replace({ query })
  },
})

const tabCount = computed(() => 2 + (showTime.value ? 1 : 0) + (canReviewTeam.value ? 1 : 0))

const description = computed(() => {
  if (tab.value === 'team') return "Review each person's delivery, timeliness and quality for a period, for appraisals, recognition and bonuses."
  if (tab.value === 'capacity') return 'Who is overbooked for the coming weeks, and who still has room to take work.'
  if (tab.value === 'time') return 'Work logs rolled up by day, person, project and issue — from timers and manual entries.'
  return 'How work is flowing across your projects: progress, trends, workload and what needs attention.'
})
</script>

<template>
  <div
    class="min-h-0 w-full flex-1 space-y-4 overflow-y-auto sm:space-y-5"
    :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'"
  >
    <PageHeader v-if="isDesktop && !projectId" title="Reports" :description="description" />
    <Tabs v-model="tab">
      <TabsList
        class="grid h-9 w-full sm:inline-flex sm:w-auto"
        :class="tabCount === 4 ? 'grid-cols-2 sm:grid-cols-4' : tabCount === 3 ? 'grid-cols-3' : 'grid-cols-2'"
      >
        <TabsTrigger value="overview" class="gap-1.5 px-3"><BarChart3 class="size-4" /> Overview</TabsTrigger>
        <TabsTrigger value="capacity" class="gap-1.5 px-3"><Gauge class="size-4 shrink-0" /> <span class="truncate">Capacity</span></TabsTrigger>
        <TabsTrigger v-if="showTime" value="time" class="gap-1.5 px-3"><Clock3 class="size-4 shrink-0" /> Time</TabsTrigger>
        <TabsTrigger v-if="canReviewTeam" value="team" class="gap-1.5 px-3"><Users class="size-4 shrink-0" /> <span class="truncate">Team</span></TabsTrigger>
      </TabsList>
    </Tabs>
    <TeamPerformance v-if="tab === 'team'" />
    <TimeReportPanel v-else-if="tab === 'time'" :locked-project-id="projectId" />
    <CapacityPanel v-else-if="tab === 'capacity'" :locked-project-id="projectId" />
    <ReportsDashboard v-else :locked-project-id="projectId" />
  </div>
</template>
