<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleCheck,
  CircleDot,
  FolderPlus,
  History,
  Inbox,
  ListTodo,
  Plus,
  Rocket,
  Share2,
  UsersRound,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import StatCard from '@/components/common/StatCard.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/modules/auth/auth.store'
import ActivityList from '@/modules/issues/components/ActivityList.vue'
import IssueRow from '@/modules/issues/components/IssueRow.vue'
import { useIssueActions } from '@/modules/issues/composables/useIssueActions'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import ScheduleMeetingSheet from '@/modules/meetings/components/ScheduleMeetingSheet.vue'
import { type Meeting, meetingsApi } from '@/modules/meetings/meetings.api'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import { useUiStore } from '@/stores/ui.store'
import type { Issue } from '@/types/models'
import { useDashboardData } from '../composables/useDashboardData'
import { consumeStartDayQuery } from '../composables/useStartDayHighlight'
import { useTodayAgenda } from '../composables/useTodayAgenda'
import { groupMyWork } from '../my-work'
import { copyShareWorkday } from '../share-workday'
import DailyBriefingCard from './DailyBriefingCard.vue'
import HabitNudgeBanner from './HabitNudgeBanner.vue'
import HomeDayLoop from './HomeDayLoop.vue'
import HomeFocusCards from './HomeFocusCards.vue'
import HomeTodayPanel from './HomeTodayPanel.vue'
import PlanUnlocksCard from './PlanUnlocksCard.vue'
import QuickCapture from './QuickCapture.vue'
import SetupChecklist from './SetupChecklist.vue'
import TeamDensityCard from './TeamDensityCard.vue'
import WeeklyPulseCard from './WeeklyPulseCard.vue'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const openIssue = useOpenIssue()
const issueActions = useIssueActions()
const { data, isLoading, error, reload } = useDashboardData()
const agenda = useTodayAgenda()
/** Invite deep-link: shared highlight survives clearing ?startDay=1 from the URL. */
const startDay = consumeStartDayQuery(route, router)

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})
const today = format(new Date(), 'EEEE, d MMMM')
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** One sentence that says what the day looks like. */
const summary = computed(() => {
  if (!data.value) return ''
  const { open, dueToday, overdue } = data.value.stats
  const meetings = agenda.items.value?.filter((item) => item.kind === 'meeting').length ?? 0
  const parts = [
    overdue ? `${overdue} overdue` : '',
    dueToday ? `${dueToday} due today` : '',
    meetings ? `${plural(meetings, 'meeting')} today` : '',
  ].filter(Boolean)
  if (!open && !parts.length) return 'You’re all caught up. Nothing is assigned to you right now.'
  return `You have ${plural(open, 'open task')}${parts.length ? `: ${parts.join(', ')}` : ''}.`
})

// --- Quick actions ---------------------------------------------------------------------
const isCreateProjectOpen = ref(false)
const meetingSheet = ref<{ meeting?: Meeting } | null>(null)
const canSchedule = ref(false)
onMounted(async () => {
  if (auth.hasFeature('meetings')) canSchedule.value = await meetingsApi.canSchedule().catch(() => false)
})
const newTask = () => ui.openCreateIssue({})

// --- The day at a glance: every figure opens the matching list ----------------------------
const mine = { assigneeId: 'me' }
const stats = computed(() => {
  const s = data.value?.stats
  if (!s) return []
  return [
    { label: 'Assigned to me', value: s.open, icon: ListTodo, tone: 'default' as const, hint: 'Open tasks', to: { name: 'issues', query: { ...mine, sort: 'dueDate' } } },
    { label: 'In progress', value: s.inProgress, icon: CircleDot, tone: 'info' as const, hint: 'Being worked on', to: { name: 'issues', query: { ...mine, statusCategory: 'in_progress' } } },
    { label: 'Due today', value: s.dueToday, icon: CalendarClock, tone: 'warning' as const, hint: `${s.dueThisWeek} due this week`, to: { name: 'issues', query: { ...mine, sort: 'dueDate' } } },
    {
      label: 'Overdue',
      value: s.overdue,
      icon: AlarmClock,
      tone: s.overdue ? ('danger' as const) : ('default' as const),
      hint: s.overdue ? 'Needs attention' : 'Everything on time',
      to: { name: 'issues', query: { ...mine, overdue: 'true', sort: 'dueDate' } },
    },
    { label: 'Done this week', value: s.completedThisWeek, icon: CircleCheck, tone: 'success' as const, hint: 'Since Monday', to: { name: 'issues', query: { ...mine, statusCategory: 'done' } } },
  ]
})

// --- My work ----------------------------------------------------------------------------
const workTab = ref<'open' | 'done'>('open')
const groups = computed(() => groupMyWork(data.value?.myWork ?? []))
const openGroups = computed(() => groups.value.filter((group) => group.bucket !== 'done'))
const doneGroups = computed(() => groups.value.filter((group) => group.bucket === 'done'))
const count = (list: typeof groups.value) => list.reduce((sum, group) => sum + group.issues.length, 0)
const shownGroups = computed(() => (workTab.value === 'open' ? openGroups.value : doneGroups.value))

async function completeIssue(issue: Issue) {
  if (await issueActions.complete(issue)) await reload()
}

const pendingStandupIds = computed(() => new Set((data.value?.standupPending ?? []).map((item) => item.projectId)))

// --- Sprints and projects ---------------------------------------------------------------------
/** The side card's tab, remembered per device. */
const sideTab = useStorage<'sprints' | 'activity'>('vector.home.sideTab', 'sprints')
const percent = (done = 0, total = 0) => (total ? Math.round((done / total) * 100) : 0)
const sprintPercent = (sprint: { totalPoints: number; donePoints: number; issueCount: number; doneCount: number }) =>
  sprint.totalPoints ? percent(sprint.donePoints, sprint.totalPoints) : percent(sprint.doneCount, sprint.issueCount)
const daysLeft = (endDate: string | null) => {
  if (!endDate) return null
  const days = differenceInCalendarDays(parseISO(endDate), new Date())
  return days < 0 ? { text: `${-days}d over`, late: true } : { text: days === 0 ? 'Ends today' : `${days}d left`, late: false }
}
</script>

<template>
  <div class="w-full space-y-3.5 p-4 sm:space-y-4 sm:p-5 lg:space-y-5 lg:p-6">
    <!-- Greeting, the day in one sentence, and the things people start most -->
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="text-xs font-medium text-muted-foreground">{{ today }} · Your workday</p>
        <h1 class="mt-0.5 text-[22px] font-semibold tracking-tight">{{ greeting }}, {{ auth.user?.name.split(' ')[0] }}</h1>
        <p v-if="summary" class="mt-1 text-[13.5px] text-muted-foreground">{{ summary }}</p>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button variant="outline" size="sm" class="max-lg:flex-1" @click="copyShareWorkday(auth.organization?.slug)">
          <Share2 /> Share workday
        </Button>
        <Button v-if="canSchedule" variant="outline" size="sm" class="max-lg:flex-1" @click="meetingSheet = {}"><CalendarPlus /> Schedule meeting</Button>
        <Button variant="outline" size="sm" class="max-lg:flex-1" @click="isCreateProjectOpen = true"><FolderPlus /> New project</Button>
        <Button size="sm" class="max-lg:flex-1" @click="newTask"><Plus /> New task</Button>
      </div>
    </header>

    <SetupChecklist v-if="data" :data="data" @create-project="isCreateProjectOpen = true" @changed="reload" />
    <HabitNudgeBanner v-if="data?.habitNudge" :nudge="data.habitNudge" />
    <TeamDensityCard v-if="data" :data="data" />

    <QuickCapture />

    <HomeDayLoop v-if="data" :data="data" :highlight="startDay" />
    <HomeFocusCards v-if="data" :data="data" @changed="reload" />
    <PlanUnlocksCard />
    <HomeTodayPanel v-if="data" :data="data" @changed="reload" />
    <WeeklyPulseCard v-if="data" :data="data" />
    <DailyBriefingCard />

    <Skeleton v-if="isLoading" class="h-[86px] w-full rounded-xl" />

    <EmptyState v-else-if="error && !data" :icon="Inbox" title="Your dashboard did not load" :description="error">
      <Button variant="outline" @click="reload">Try again</Button>
    </EmptyState>

    <template v-else-if="data">
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
        <RouterLink
          v-for="stat in stats"
          :key="stat.label"
          :to="stat.to"
          class="group relative min-w-0"
          :title="`Open: ${stat.label}`"
        >
          <StatCard variant="card" :label="stat.label" :value="stat.value" :icon="stat.icon" :tone="stat.tone" :hint="stat.hint" />
          <ArrowRight class="pointer-events-none absolute top-3.5 right-3.5 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </RouterLink>
      </div>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
        <div class="min-w-0 space-y-5">
          <!-- My work -->
          <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <header class="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-4 py-2 sm:gap-3 sm:py-0">
              <h2 class="text-sm font-semibold">My work</h2>
              <div class="flex h-7 shrink-0 items-center rounded-md bg-muted p-0.5" role="tablist" aria-label="My work">
                <button
                  v-for="tab in [
                    { value: 'open', label: 'Open', count: count(openGroups) },
                    { value: 'done', label: 'Done this week', count: count(doneGroups) },
                  ] as const"
                  :key="tab.value"
                  type="button"
                  role="tab"
                  :aria-selected="workTab === tab.value"
                  class="flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors"
                  :class="workTab === tab.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'"
                  @click="workTab = tab.value"
                >
                  {{ tab.label }} <span class="tabular-nums opacity-70">{{ tab.count }}</span>
                </button>
              </div>
              <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
                <RouterLink :to="{ name: 'issues', query: { assigneeId: 'me', sort: 'dueDate' } }">View all <ArrowRight /></RouterLink>
              </Button>
            </header>
            <EmptyState
              v-if="!shownGroups.length"
              :icon="workTab === 'open' ? Inbox : CircleCheck"
              :title="workTab === 'open' ? 'Nothing assigned to you' : 'Nothing finished yet this week'"
              :description="workTab === 'open' ? 'Create a task, or pick one up from a project board.' : 'Tasks you complete this week show up here.'"
              class="py-12"
            >
              <div v-if="workTab === 'open'" class="flex flex-wrap justify-center gap-2">
                <Button size="sm" @click="newTask"><Plus /> New task</Button>
                <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'projects' }">Browse projects</RouterLink></Button>
              </div>
            </EmptyState>
            <div v-else class="max-h-[30rem] overflow-y-auto scrollbar-thin">
              <section v-for="group in shownGroups" :key="group.bucket">
                <h3
                  class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/70 bg-muted/80 px-4 py-1.5 text-xs font-medium backdrop-blur"
                  :class="group.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'"
                >
                  {{ group.title }} <span class="tabular-nums opacity-70">{{ group.issues.length }}</span>
                </h3>
                <IssueRow v-for="issue in group.issues" :key="issue.id" :issue="issue" @open="openIssue">
                  <template v-if="workTab === 'open'" #actions>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="opacity-0 group-hover:opacity-100"
                      :aria-label="`Complete ${issue.key}`"
                      title="Mark done"
                      @click.stop="completeIssue(issue)"
                    >
                      <Check class="size-3.5" />
                    </Button>
                  </template>
                </IssueRow>
              </section>
            </div>
          </section>

          <!-- Projects: jump into the board (or standup if still due) -->
          <section v-if="data.projects.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <header class="flex h-12 items-center gap-2 border-b border-border px-4">
              <h2 class="text-sm font-semibold">Projects</h2>
              <span class="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">{{ data.projects.length }}</span>
              <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
                <RouterLink :to="{ name: 'projects' }">All projects <ArrowRight /></RouterLink>
              </Button>
            </header>
            <div class="hidden grid-cols-[minmax(0,1.6fr)_6rem_minmax(0,1fr)_5rem_minmax(8rem,1fr)_auto] gap-4 border-b border-border/70 bg-muted/40 px-4 py-1.5 text-[11px] font-medium text-muted-foreground md:grid">
              <span>Project</span><span class="text-right">Open</span><span>Sprint</span><span>People</span><span>Progress</span><span class="text-right">Continue</span>
            </div>
            <div
              v-for="project in data.projects"
              :key="project.id"
              class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0 md:grid-cols-[minmax(0,1.6fr)_6rem_minmax(0,1fr)_5rem_minmax(8rem,1fr)_auto] md:gap-4"
            >
              <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }" class="flex min-w-0 items-center gap-2.5 hover:opacity-90">
                <span class="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" :style="{ backgroundColor: project.color }">
                  {{ project.key.slice(0, 3) }}
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-[13px] font-medium">{{ project.name }}</span>
                  <span class="block truncate text-[11.5px] text-muted-foreground">{{ project.team?.name ?? (project.type === 'scrum' ? 'Scrum' : 'Kanban') }}</span>
                </span>
              </RouterLink>
              <span class="text-right text-[13px] tabular-nums">{{ project.issueSummary?.open ?? 0 }}</span>
              <span class="hidden min-w-0 truncate text-[12.5px] text-muted-foreground md:block">
                <template v-if="project.activeSprint"><Rocket class="mr-1 inline size-3 text-primary" />{{ project.activeSprint.name }}</template>
                <template v-else>—</template>
              </span>
              <span class="hidden items-center gap-1 text-[12.5px] text-muted-foreground tabular-nums md:flex"><UsersRound class="size-3.5" /> {{ project.memberCount ?? 0 }}</span>
              <span class="hidden items-center gap-2 md:flex">
                <Progress :model-value="percent(project.issueSummary?.done, project.issueSummary?.total)" class="h-1.5 flex-1" indicator-class="bg-success" />
                <span class="w-9 text-right text-[12px] text-muted-foreground tabular-nums">{{ percent(project.issueSummary?.done, project.issueSummary?.total) }}%</span>
              </span>
              <div class="flex shrink-0 items-center justify-end gap-1.5">
                <Button v-if="pendingStandupIds.has(project.id)" size="sm" variant="outline" as-child>
                  <RouterLink :to="{ name: 'project-standup', params: { projectId: project.id } }">Standup</RouterLink>
                </Button>
                <Button size="sm" variant="ghost" as-child>
                  <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }">Board</RouterLink>
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div class="min-w-0 space-y-5">
          <!-- Sprints and activity share one card, one tab at a time -->
          <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <header class="flex h-12 items-center gap-3 border-b border-border px-4">
              <div class="flex h-7 items-center rounded-md bg-muted p-0.5" role="tablist" aria-label="Sprints and activity">
                <button
                  v-for="tab in [
                    { value: 'sprints', label: 'Active sprints', icon: Rocket, count: data.activeSprints.length },
                    { value: 'activity', label: 'Recent activity', icon: History, count: data.recentActivity.length },
                  ] as const"
                  :key="tab.value"
                  type="button"
                  role="tab"
                  :aria-selected="sideTab === tab.value"
                  class="flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors"
                  :class="sideTab === tab.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'"
                  @click="sideTab = tab.value"
                >
                  <component :is="tab.icon" class="size-3.5" :class="sideTab === tab.value && 'text-primary'" />
                  {{ tab.label }}
                  <span v-if="tab.count" class="tabular-nums opacity-70">{{ tab.count }}</span>
                </button>
              </div>
            </header>

            <template v-if="sideTab === 'sprints'">
            <p v-if="!data.activeSprints.length" class="px-4 py-5 text-[13px] text-muted-foreground">No sprint is running right now.</p>
            <ul v-else class="max-h-[24rem] divide-y divide-border/70 overflow-y-auto scrollbar-thin">
              <li v-for="sprint in data.activeSprints" :key="sprint.id">
                <RouterLink :to="{ name: 'project-board', params: { projectId: sprint.projectId } }" class="block space-y-2 px-4 py-3 transition-colors hover:bg-accent/50">
                  <p class="flex items-center gap-2 text-[13px]">
                    <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: sprint.project?.color }" />
                    <span class="truncate font-medium">{{ sprint.name }}</span>
                    <span class="truncate text-muted-foreground">{{ sprint.project?.name }}</span>
                    <span
                      v-if="daysLeft(sprint.endDate)"
                      class="ml-auto shrink-0 text-[11.5px] tabular-nums"
                      :class="daysLeft(sprint.endDate)!.late ? 'font-medium text-destructive' : 'text-muted-foreground'"
                    >
                      {{ daysLeft(sprint.endDate)!.text }}
                    </span>
                  </p>
                  <div class="flex items-center gap-2">
                    <Progress :model-value="sprintPercent(sprint)" class="h-1.5 flex-1" indicator-class="bg-success" />
                    <span class="w-9 text-right text-[12px] font-medium tabular-nums">{{ sprintPercent(sprint) }}%</span>
                  </div>
                  <p class="text-[11.5px] text-muted-foreground tabular-nums">
                    {{ sprint.doneCount }}/{{ sprint.issueCount }} tasks<template v-if="sprint.totalPoints"> · {{ sprint.donePoints }}/{{ sprint.totalPoints }} pts</template>
                  </p>
                </RouterLink>
              </li>
            </ul>
            </template>

            <template v-else>
              <p v-if="!data.recentActivity.length" class="px-4 py-5 text-[13px] text-muted-foreground">No activity yet.</p>
              <div v-else class="max-h-[24rem] overflow-y-auto px-4 py-3 scrollbar-thin">
                <ActivityList :activities="data.recentActivity" show-issue dense />
              </div>
            </template>
          </section>
        </div>
      </div>
    </template>

    <CreateProjectDialog v-model:open="isCreateProjectOpen" />
    <ScheduleMeetingSheet v-if="canSchedule" v-model:target="meetingSheet" @saved="agenda.reload()" />
  </div>
</template>
