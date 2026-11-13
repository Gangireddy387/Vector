<script setup lang="ts">
import { format } from 'date-fns'
import { AlarmClock, ArrowRight, CalendarClock, CircleCheck, CircleDot, Inbox, ListTodo, Rocket } from 'lucide-vue-next'
import { computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import StatCard from '@/components/common/StatCard.vue'
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
const { data, isLoading, error, reload } = useDashboardData()

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})
const today = format(new Date(), 'EEEE, d MMMM')
const groups = computed(() => groupMyWork(data.value?.myWork ?? []))
const myWorkCount = computed(() => groups.value.reduce((sum, group) => sum + group.issues.length, 0))
const completion = (summary?: { total: number; done: number }) => (summary?.total ? Math.round((summary.done / summary.total) * 100) : 0)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] space-y-5 px-6 py-6">
    <header>
      <p class="text-xs font-medium text-muted-foreground">{{ today }}</p>
      <h1 class="mt-0.5 text-[22px] font-semibold tracking-tight">{{ greeting }}, {{ auth.user?.name.split(' ')[0] }}</h1>
    </header>

    <QuickCapture />

    <Skeleton v-if="isLoading" class="h-[74px] w-full rounded-xl" />

    <EmptyState v-else-if="error && !data" :icon="Inbox" title="Your dashboard did not load" :description="error">
      <Button variant="outline" @click="reload">Try again</Button>
    </EmptyState>

    <template v-else-if="data">
      <!-- The day at a glance -->
      <div class="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card shadow-soft lg:grid-cols-5">
        <StatCard label="Assigned to me" :value="data.stats.open" :icon="ListTodo" />
        <StatCard label="In progress" :value="data.stats.inProgress" :icon="CircleDot" tone="info" />
        <StatCard label="Due today" :value="data.stats.dueToday" :icon="CalendarClock" tone="warning" />
        <StatCard label="Overdue" :value="data.stats.overdue" :icon="AlarmClock" :tone="data.stats.overdue ? 'danger' : 'default'" />
        <StatCard label="Completed this week" :value="data.stats.completedThisWeek" :icon="CircleCheck" tone="success" />
      </div>

      <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <header class="flex h-12 items-center gap-2 border-b border-border px-4">
            <h2 class="text-sm font-semibold">My work</h2>
            <span v-if="myWorkCount" class="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">{{ myWorkCount }}</span>
            <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
              <RouterLink :to="{ name: 'issues', query: { assigneeId: 'me' } }">View all <ArrowRight /></RouterLink>
            </Button>
          </header>
          <EmptyState v-if="!groups.length" :icon="Inbox" title="Nothing assigned to you" description="Enjoy the calm, or pick something from a backlog." class="py-14" />
          <section v-for="group in groups" :key="group.bucket">
            <h3
              class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/70 bg-muted/70 px-4 py-1.5 text-xs font-medium backdrop-blur"
              :class="group.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ group.title }} <span class="tabular-nums opacity-70">{{ group.issues.length }}</span>
            </h3>
            <IssueRow v-for="issue in group.issues" :key="issue.id" :issue="issue" @open="openIssue" />
          </section>
        </section>

        <div class="space-y-5">
          <section class="rounded-xl border border-border bg-card shadow-soft">
            <header class="flex h-12 items-center gap-2 border-b border-border px-4">
              <Rocket class="size-4 text-primary" />
              <h2 class="text-sm font-semibold">Active sprints</h2>
            </header>
            <div class="space-y-1 p-2">
              <p v-if="!data.activeSprints.length" class="px-2 py-3 text-sm text-muted-foreground">No sprint is running right now.</p>
              <RouterLink
                v-for="sprint in data.activeSprints"
                :key="sprint.id"
                :to="{ name: 'project-board', params: { projectId: sprint.projectId } }"
                class="block space-y-2 rounded-lg p-2.5 transition-colors hover:bg-accent"
              >
                <p class="flex items-center gap-2 text-[13px] font-medium">
                  <span class="size-2.5 rounded-[3px]" :style="{ backgroundColor: sprint.project?.color }" />
                  {{ sprint.name }}
                  <span class="truncate font-normal text-muted-foreground">{{ sprint.project?.name }}</span>
                </p>
                <SprintProgress :sprint="sprint" :stats="sprint" />
              </RouterLink>
            </div>
          </section>

          <section class="rounded-xl border border-border bg-card shadow-soft">
            <header class="flex h-12 items-center border-b border-border px-4"><h2 class="text-sm font-semibold">Recent activity</h2></header>
            <div class="max-h-[26rem] overflow-y-auto px-4 py-3 scrollbar-thin">
              <ActivityList :activities="data.recentActivity" show-issue dense />
            </div>
          </section>
        </div>
      </div>

      <section v-if="data.projects.length" class="space-y-2.5">
        <h2 class="text-sm font-semibold">Projects</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="project in data.projects"
            :key="project.id"
            :to="{ name: 'project-board', params: { projectId: project.id } }"
            class="group space-y-3 rounded-xl border border-border bg-card p-4 shadow-soft transition-[border-color,box-shadow] hover:border-input hover:shadow-elevated"
          >
            <p class="flex items-center gap-2 text-[13px] font-medium">
              <span class="size-2.5 rounded-[3px]" :style="{ backgroundColor: project.color }" />
              <span class="truncate">{{ project.name }}</span>
              <ArrowRight class="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <Progress :model-value="completion(project.issueSummary)" class="h-1" />
            <p class="text-xs text-muted-foreground tabular-nums">{{ project.issueSummary?.open ?? 0 }} open · {{ completion(project.issueSummary) }}% done</p>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
