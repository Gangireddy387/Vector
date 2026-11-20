<script setup lang="ts">
import { useOnline } from '@vueuse/core'
import { PartyPopper, RefreshCw, Share2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import { useIssueActions } from '@/modules/issues/composables/useIssueActions'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import type { Issue } from '@/types/models'
import { useDashboardData } from '../composables/useDashboardData'
import { useHomeLayout } from '../composables/useHomeLayout'
import { consumeStartDayQuery } from '../composables/useStartDayHighlight'
import { bucketOf } from '../my-work'
import { copyShareWorkday } from '../share-workday'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import DailyBriefingCard from './DailyBriefingCard.vue'
import HabitCoachCard from './HabitCoachCard.vue'
import HabitNudgeBanner from './HabitNudgeBanner.vue'
import HomeCustomizeMenu from './HomeCustomizeMenu.vue'
import HomeDayLoop from './HomeDayLoop.vue'
import HomeFocusCards from './HomeFocusCards.vue'
import HomeLoadingShell from './HomeLoadingShell.vue'
import HomeMyTeamCard from './HomeMyTeamCard.vue'
import HomeTodayPanel from './HomeTodayPanel.vue'
import PlanUnlocksCard from './PlanUnlocksCard.vue'
import PlanUsageCard from './PlanUsageCard.vue'
import QuickCapture from './QuickCapture.vue'
import SetupChecklist from './SetupChecklist.vue'
import TeamDensityCard from './TeamDensityCard.vue'
import WeeklyPulseCard from './WeeklyPulseCard.vue'

type Segment = 'today' | 'upcoming' | 'anytime' | 'done'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const actions = useIssueActions()
const openIssue = useOpenIssue()
const { data, isLoading, error, isStale, reload } = useDashboardData()
const isOnline = useOnline()
const offlineLoadHint = computed(() =>
  !isOnline.value
    ? 'You appear to be offline. Connect and try again, or open Home once online so it can load for next time.'
    : error.value,
)
const { layout: homeLayout, isHidden, isCustomized, toggle: toggleHomeWidget, reset: resetHomeLayout } = useHomeLayout()
const hiddenKeys = computed(() => homeLayout.value?.hidden ?? [])
const show = (key: Parameters<typeof isHidden>[0]) => !isHidden(key)
const isCreateProjectOpen = ref(false)
const segment = ref<Segment>('today')
/** Invite deep-link: shared highlight survives clearing ?startDay=1 from the URL. */
const startDay = consumeStartDayQuery(route, router)

const SEGMENTS: Array<{ value: Segment; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'anytime', label: 'Anytime' },
  { value: 'done', label: 'Done' },
]

/** "Today" is what needs attention now: overdue, due today, or already in progress. */
const segmentOf = (issue: Issue): Segment => {
  const bucket = bucketOf(issue)
  if (bucket === 'done') return 'done'
  if (bucket === 'overdue' || bucket === 'today' || issue.status?.category === 'in_progress') return 'today'
  if (bucket === 'anytime') return 'anytime'
  return 'upcoming'
}

const bySegment = computed(() => {
  const result: Record<Segment, Issue[]> = { today: [], upcoming: [], anytime: [], done: [] }
  for (const issue of data.value?.myWork ?? []) result[segmentOf(issue)].push(issue)
  return result
})
const visible = computed(() => bySegment.value[segment.value])
const summary = computed(() => {
  const stats = data.value?.stats
  if (!stats) return ''
  const parts = [stats.dueToday && `${stats.dueToday} due today`, stats.overdue && `${stats.overdue} overdue`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nothing urgent. Nice.'
})

async function complete(issue: Issue) {
  if (await actions.complete(issue)) await reload()
}
</script>

<template>
  <div class="w-full space-y-3.5 p-3 sm:space-y-4">
    <div class="flex flex-col gap-2 px-1 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-[11px] font-medium text-muted-foreground">Your workday</p>
        <p class="text-lg font-semibold">Hi {{ auth.user?.name?.split(' ')[0] }}</p>
        <p class="text-sm" :class="data?.stats?.overdue ? 'text-destructive' : 'text-muted-foreground'">{{ summary }}</p>
      </div>
      <div class="flex self-end items-center gap-1 sm:self-start">
        <HomeCustomizeMenu
          :hidden="hiddenKeys"
          :customized="isCustomized"
          @toggle="toggleHomeWidget"
          @reset="resetHomeLayout"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Share workday"
          @click="copyShareWorkday(auth.organization?.slug)"
        >
          <Share2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Refresh" @click="reload"><RefreshCw /></Button>
      </div>
    </div>

    <SetupChecklist v-if="data && show('setup')" :data="data" @create-project="isCreateProjectOpen = true" @changed="reload" />
    <HabitCoachCard v-if="data && show('habit')" :data="data" @create-project="isCreateProjectOpen = true" />
    <HabitNudgeBanner v-if="data?.habitNudge && show('habit')" :nudge="data.habitNudge" />
    <TeamDensityCard v-if="data && show('density')" :data="data" />
    <HomeMyTeamCard v-if="data && show('myTeam')" :data="data" />
    <CreateProjectDialog v-model:open="isCreateProjectOpen" />

    <QuickCapture v-if="show('quickCapture')" stacked />

    <HomeDayLoop v-if="data && show('dayLoop')" :data="data" :highlight="startDay" />
    <HomeFocusCards v-if="data && show('focus')" :data="data" @changed="reload" />
    <PlanUsageCard v-if="show('planUsage')" />
    <PlanUnlocksCard v-if="show('planUnlocks')" />
    <HomeTodayPanel v-if="data && show('today')" :data="data" @changed="reload" />

    <HomeLoadingShell v-if="isLoading && !data" variant="mobile" />
    <EmptyState v-else-if="error && !data" :icon="RefreshCw" title="Your tasks did not load" :description="offlineLoadHint ?? error">
      <Button variant="outline" @click="reload">Try again</Button>
    </EmptyState>
    <template v-else-if="data">
      <p
        v-if="isStale || !isOnline"
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
        role="status"
      >
        Showing last loaded Home{{ !isOnline ? ' while offline' : '' }}.
        <button type="button" class="ml-1 font-medium underline" @click="reload">Refresh</button>
      </p>
      <WeeklyPulseCard v-if="show('pulse')" :data="data" />
      <DailyBriefingCard v-if="show('briefing')" />

      <div class="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Task groups">
        <button
          v-for="item in SEGMENTS"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="segment === item.value"
          class="min-w-0 rounded-md px-1 py-2 text-center text-[11px] font-medium transition sm:text-xs"
          :class="segment === item.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click="segment = item.value"
        >
          <span class="block truncate">{{ item.label }}</span>
          <span class="opacity-70 tabular-nums">{{ bySegment[item.value].length }}</span>
        </button>
      </div>

      <EmptyState
        v-if="!visible.length"
        :icon="PartyPopper"
        :title="segment === 'done' ? 'Nothing completed yet this week' : 'All clear here'"
        :description="segment === 'today' ? 'No overdue or urgent work. Capture something above or check Upcoming.' : undefined"
      />
      <ul v-else class="stagger-in space-y-2">
        <li v-for="issue in visible" :key="issue.id">
          <IssueCard :issue="issue" show-project completable @open="openIssue" @complete="complete" />
        </li>
      </ul>
    </template>
  </div>
</template>
