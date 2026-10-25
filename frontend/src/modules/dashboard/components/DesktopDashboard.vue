<script setup lang="ts">
import { AlarmClock, CalendarClock, CircleCheck, CircleDot, Inbox, ListTodo, Rocket } from 'lucide-vue-next'
import { computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import StatCard from '@/components/common/StatCard.vue'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import ActivityList from '@/modules/issues/components/ActivityList.vue'
import IssueRow from '@/modules/issues/components/IssueRow.vue'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import SprintProgress from '@/modules/sprints/components/SprintProgress.vue'
import { useDashboardData } from '../composables/useDashboardData'
import { groupMyWork } from '../my-work'
import QuickCapture from './QuickCapture.vue'

const auth = useAuthStore()
const openIssue = useOpenIssue()
const { data, isLoading } = useDashboardData()

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})
const groups = computed(() => groupMyWork(data.value?.myWork ?? []))
const completion = (summary?: { total: number; done: number }) => (summary?.total ? Math.round((summary.done / summary.total) * 100) : 0)
</script>

<template>
  <div class="w-full space-y-4 p-5">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">{{ greeting }}, {{ auth.user?.name.split(' ')[0] }}</h1>
      <p class="text-sm text-muted-foreground">Here is everything on your plate across projects.</p>
    </header>

    <QuickCapture />

    <div v-if="isLoading" class="grid grid-cols-5 gap-3">
      <Skeleton v-for="index in 5" :key="index" class="h-16" />
    </div>

    <template v-else-if="data">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Assigned to me" :value="data.stats.open" :icon="ListTodo" />
        <StatCard label="In progress" :value="data.stats.inProgress" :icon="CircleDot" tone="info" />
        <StatCard label="Due today" :value="data.stats.dueToday" :icon="CalendarClock" tone="warning" />
        <StatCard label="Overdue" :value="data.stats.overdue" :icon="AlarmClock" :tone="data.stats.overdue ? 'danger' : 'default'" />
        <StatCard label="Completed this week" :value="data.stats.completedThisWeek" :icon="CircleCheck" tone="success" />
      </div>

      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card class="gap-0 py-0">
          <CardHeader class="border-b py-3">
            <CardTitle>My work</CardTitle>
            <CardDescription>Grouped by due date, in-progress first.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" as-child><RouterLink :to="{ name: 'issues', query: { assigneeId: 'me' } }">View all</RouterLink></Button>
            </CardAction>
          </CardHeader>
          <CardContent class="px-0">
            <EmptyState v-if="!groups.length" :icon="Inbox" title="Nothing assigned to you" description="Enjoy the calm — or pick something from a backlog." />
            <section v-for="group in groups" :key="group.bucket">
              <h3
                class="sticky top-0 z-10 flex items-center justify-between bg-muted/60 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase backdrop-blur"
                :class="group.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ group.title }} <span class="font-normal">{{ group.issues.length }}</span>
              </h3>
              <IssueRow v-for="issue in group.issues" :key="issue.id" :issue="issue" @open="openIssue" />
            </section>
          </CardContent>
        </Card>

        <div class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2"><Rocket class="size-4 text-primary" /> Active sprints</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <p v-if="!data.activeSprints.length" class="text-sm text-muted-foreground">No sprint is running right now.</p>
              <RouterLink
                v-for="sprint in data.activeSprints"
                :key="sprint.id"
                :to="{ name: 'project-board', params: { projectId: sprint.projectId } }"
                class="block space-y-2 p-2 -m-2 hover:bg-muted/50"
              >
                <p class="flex items-center gap-2 text-sm font-medium">
                  <span class="size-2.5" :style="{ backgroundColor: sprint.project?.color }" />
                  {{ sprint.name }}
                  <span class="font-normal text-muted-foreground">· {{ sprint.project?.name }}</span>
                </p>
                <SprintProgress :sprint="sprint" :stats="sprint" />
              </RouterLink>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardContent class="max-h-[26rem] overflow-y-auto scrollbar-thin">
              <ActivityList :activities="data.recentActivity" show-issue dense />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="project in data.projects"
            :key="project.id"
            :to="{ name: 'project-board', params: { projectId: project.id } }"
            class="surface-hover space-y-2 border border-border/70 bg-card p-3"
          >
            <p class="flex items-center gap-2 text-sm font-medium">
              <span class="size-2.5" :style="{ backgroundColor: project.color }" /> {{ project.name }}
            </p>
            <Progress :model-value="completion(project.issueSummary)" class="h-1.5" />
            <p class="text-xs text-muted-foreground">{{ project.issueSummary?.open ?? 0 }} open · {{ completion(project.issueSummary) }}% done</p>
          </RouterLink>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
