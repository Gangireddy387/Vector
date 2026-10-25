<script setup lang="ts">
import { BarChart3, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDevice } from '@/composables/useDevice'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import ReportsDashboard from '../components/ReportsDashboard.vue'
import TeamPerformance from '../components/TeamPerformance.vue'

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
const tab = computed({
  get: () => (canReviewTeam.value && route.query.tab === 'team' ? 'team' : 'overview'),
  set: (next: string) => void router.replace({ query: next === 'team' ? { tab: 'team' } : {} }),
})
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? (projectId ? 'px-5 py-4' : 'p-5') : 'p-3'">
    <PageHeader
      v-if="isDesktop && !projectId"
      title="Reports"
      :description="
        tab === 'team'
          ? 'Review each person\'s delivery, timeliness and quality for a period, for appraisals, recognition and bonuses.'
          : 'How work is flowing across your projects: progress, trends, workload and what needs attention.'
      "
    />
    <Tabs v-if="canReviewTeam" v-model="tab">
      <TabsList class="h-9">
        <TabsTrigger value="overview" class="gap-1.5 px-3"><BarChart3 class="size-4" /> Overview</TabsTrigger>
        <TabsTrigger value="team" class="gap-1.5 px-3"><Users class="size-4" /> Team performance</TabsTrigger>
      </TabsList>
    </Tabs>
    <TeamPerformance v-if="tab === 'team'" />
    <ReportsDashboard v-else :locked-project-id="projectId" />
  </div>
</template>
