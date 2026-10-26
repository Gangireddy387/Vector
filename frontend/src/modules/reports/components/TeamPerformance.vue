<script setup lang="ts">
import { Award, Bug, CircleCheck, Clock, Download, FolderKanban, Info, MessageSquare, RotateCcw, Timer, Trophy, Users, Zap } from 'lucide-vue-next'
import { type Component, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { defaultReviewPeriod, describePeriod, type Period } from '../period'
import { type MemberPerformance, type PerformanceHighlight, reportsApi, type TeamPerformanceReport } from '../reports.api'
import MemberReviewSheet from './MemberReviewSheet.vue'
import PeriodPicker from './PeriodPicker.vue'
import ReportKpiCard from './ReportKpiCard.vue'
import TrendSparkline from './TrendSparkline.vue'

/** When set (project Progress page) the review is pinned to that project. */
const props = defineProps<{ lockedProjectId?: string }>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const queryText = (key: string) => (typeof route.query[key] === 'string' && route.query[key] ? (route.query[key] as string) : undefined)

/** The period and project live in the URL so a review can be bookmarked and shared with other admins. */
const period = computed<Period>({
  get: () => {
    const from = queryText('from')
    const to = queryText('to')
    return from && to && DATE_PATTERN.test(from) && DATE_PATTERN.test(to) && from <= to ? { from, to } : defaultReviewPeriod()
  },
  set: (next) => void router.replace({ query: { ...route.query, from: next.from, to: next.to } }),
})
const projectId = computed({
  get: () => props.lockedProjectId ?? queryText('project'),
  set: (value?: string) => void router.replace({ query: { ...route.query, project: value || undefined } }),
})

const reviewableProjects = computed(() =>
  auth.isOrganizationAdmin ? projects.activeProjects : projects.activeProjects.filter((project) => project.myRole === 'admin'),
)
const projectOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: reviewableProjects.value.length === projects.activeProjects.length ? 'All projects' : 'All my projects', icon: FolderKanban },
  ...reviewableProjects.value.map((project) => ({ value: project.id, label: project.name, description: project.key, color: project.color })),
])

const report = ref<TeamPerformanceReport | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

async function load() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    report.value = await reportsApi.performance({ ...period.value, projectId: projectId.value })
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}
watch([period, projectId], load, { immediate: true, deep: true })

// --- Leaderboard ---------------------------------------------------------------

type SortKey = 'score' | 'delivered' | 'onTimeRate' | 'averageCycleDays' | 'bugsFixed' | 'reopened' | 'loggedMinutes' | 'comments' | 'open'
const sortKey = ref<SortKey>('score')
const sortAscending = ref(false)
const LOWER_IS_BETTER: SortKey[] = ['averageCycleDays', 'reopened']

function sortBy(key: SortKey) {
  if (sortKey.value === key) sortAscending.value = !sortAscending.value
  else {
    sortKey.value = key
    sortAscending.value = LOWER_IS_BETTER.includes(key)
  }
}

const usesPoints = computed(() => report.value?.unit === 'points')
const deliveredOf = (row: MemberPerformance) => (usesPoints.value ? row.completedPoints : row.completed)
const valueOf = (row: MemberPerformance, key: SortKey) => (key === 'delivered' ? deliveredOf(row) : row[key])

const rows = computed(() => {
  const list = [...(report.value?.members ?? [])]
  const direction = sortAscending.value ? 1 : -1
  return list.sort((a, b) => {
    const left = valueOf(a, sortKey.value)
    const right = valueOf(b, sortKey.value)
    if (left === null && right === null) return (a.rank ?? 999) - (b.rank ?? 999)
    if (left === null) return 1
    if (right === null) return -1
    return (left - right) * direction || (a.rank ?? 999) - (b.rank ?? 999)
  })
})

const COLUMNS: Array<{ key: SortKey; label: string; hint: string; align?: 'right' }> = [
  { key: 'score', label: 'Score', hint: 'Contribution score for this period, 0–100' },
  { key: 'delivered', label: 'Delivered', hint: 'Tasks completed (and story points)', align: 'right' },
  { key: 'onTimeRate', label: 'On time', hint: 'Completed on or before the due date (tasks that had one)', align: 'right' },
  { key: 'averageCycleDays', label: 'Cycle', hint: 'Average days from starting work to done. Lower is better', align: 'right' },
  { key: 'bugsFixed', label: 'Bugs', hint: 'Bugs fixed', align: 'right' },
  { key: 'reopened', label: 'Reopened', hint: 'Finished tasks that had to be reopened. Lower is better', align: 'right' },
  { key: 'loggedMinutes', label: 'Logged', hint: 'Time logged on tasks', align: 'right' },
  { key: 'comments', label: 'Comments', hint: 'Comments written: helping and reviewing others', align: 'right' },
  { key: 'open', label: 'Open now', hint: 'Work assigned right now (overdue in red)', align: 'right' },
]

const hours = (minutes: number) => (minutes ? `${Math.round((minutes / 60) * 10) / 10}h` : '—')
const scoreTone = (score: number) => (score >= 80 ? 'bg-success' : score >= 55 ? 'bg-primary' : 'bg-warning')
const rankTone = (rank: number | null) =>
  rank === 1 ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300' : rank === 2 ? 'bg-slate-400/20 text-slate-600 dark:text-slate-300' : rank === 3 ? 'bg-orange-400/20 text-orange-700 dark:text-orange-300' : 'text-muted-foreground'

const HIGHLIGHT_ICONS: Record<PerformanceHighlight['kind'], Component> = {
  top_delivery: Trophy,
  most_reliable: CircleCheck,
  fastest: Zap,
  bug_hunter: Bug,
  collaborator: MessageSquare,
  most_hours: Clock,
}
const memberById = computed(() => new Map((report.value?.members ?? []).map((row) => [row.user.id, row])))
const bucketLabels = computed(() =>
  (report.value?.buckets ?? []).map((bucket) => (bucket.unit === 'month' ? formatDate(bucket.start, 'MMM yyyy') : `Week of ${formatDate(bucket.start, 'd MMM')}`)),
)

// --- Review sheet --------------------------------------------------------------

const reviewUserId = ref<string | null>(null)
const reviewOpen = computed({
  get: () => Boolean(reviewUserId.value),
  set: (open) => {
    if (!open) reviewUserId.value = null
  },
})

// --- Export ----------------------------------------------------------------------

function exportCsv() {
  if (!report.value) return
  const header = [
    'Rank', 'Name', 'Email', 'Score', 'Tasks completed', 'Story points', 'On-time %', 'Due-dated tasks', 'Avg cycle days',
    'Bugs fixed', 'High priority done', 'Reopened', 'Hours logged', 'Comments', 'Tasks created', 'Open now', 'Overdue now',
  ]
  const lines = rows.value.map((row) => [
    row.rank ?? '', row.user.name, row.user.email, row.score ?? '', row.completed, row.completedPoints, row.onTimeRate ?? '', row.withDueDate,
    row.averageCycleDays ?? '', row.bugsFixed, row.highPriorityDone, row.reopened, Math.round((row.loggedMinutes / 60) * 10) / 10, row.comments,
    row.created, row.open, row.overdue,
  ])
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const csv = [header, ...lines].map((line) => line.map(escape).join(',')).join('\n')
  const scope = report.value.projects.length === 1 ? report.value.projects[0]!.key : 'all-projects'
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
  link.download = `team-performance-${scope}-${report.value.period.from}-to-${report.value.period.to}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <SelectField
          v-if="!lockedProjectId"
          :model-value="projectId ?? null"
          :options="projectOptions"
          size="sm"
          class="w-52"
          aria-label="Project"
          @update:model-value="(value) => (projectId = value ?? undefined)"
        />
        <PeriodPicker v-model="period" />
      </div>
      <div class="flex items-center gap-2">
        <Popover>
          <PopoverTrigger as-child>
            <Button variant="ghost" size="sm"><Info /> How scores work</Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-80 space-y-2 text-sm">
            <p class="font-semibold">Contribution score (0–100)</p>
            <p class="text-muted-foreground">Compares people who completed work in this period, on the same projects:</p>
            <ul class="space-y-1 text-muted-foreground">
              <li><span class="font-medium text-foreground">50% Delivery</span> · {{ usesPoints ? 'story points' : 'issues' }} completed, relative to the top performer</li>
              <li><span class="font-medium text-foreground">20% On time</span> · share finished by the due date</li>
              <li><span class="font-medium text-foreground">20% Quality</span> · finished work that did not need reopening</li>
              <li><span class="font-medium text-foreground">10% Collaboration</span> · comments and tasks raised</li>
            </ul>
            <p class="text-xs text-muted-foreground">Use it as a starting point for a conversation, together with the details in each person's review, not as the only input.</p>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" :disabled="!report?.members.length" @click="exportCsv"><Download /> Export CSV</Button>
      </div>
    </div>

    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

    <div v-if="isLoading && !report" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Skeleton v-for="index in 5" :key="index" class="h-32" />
      </div>
      <Skeleton class="h-80 w-full" />
    </div>

    <div v-else-if="report" class="space-y-4 transition-opacity" :class="isLoading && 'opacity-60'">
      <p class="text-xs text-muted-foreground">
        {{ describePeriod(report.period) }} · {{ report.projects.length === 1 ? report.projects[0]!.name : `${report.projects.length} projects` }}
      </p>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <ReportKpiCard
          label="Completed"
          :value="report.totals.completed"
          :icon="CircleCheck"
          tone="success"
          :explanation="report.totals.completedPoints ? `${report.totals.completedPoints} story points by ${report.totals.people} people.` : `Tasks finished by ${report.totals.people} people.`"
        />
        <ReportKpiCard
          label="On-time delivery"
          :value="report.totals.onTimeRate === null ? '—' : `${report.totals.onTimeRate}%`"
          :icon="Award"
          tone="info"
          explanation="Completed issues that met their due date."
        />
        <ReportKpiCard
          label="Cycle time"
          :value="report.totals.averageCycleDays === null ? '—' : `${report.totals.averageCycleDays}d`"
          :icon="Timer"
          tone="warning"
          explanation="Average days from starting work to done."
        />
        <ReportKpiCard label="Time logged" :value="hours(report.totals.loggedMinutes)" :icon="Clock" explanation="Hours recorded on issues in this period." />
        <ReportKpiCard
          label="Reopened"
          :value="report.totals.reopened"
          :icon="RotateCcw"
          :tone="report.totals.reopened ? 'danger' : 'default'"
          explanation="Finished issues that had to be reopened."
        />
      </div>

      <section v-if="report.highlights.length" aria-label="Highlights">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Standouts this period</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <button
            v-for="highlight in report.highlights"
            :key="highlight.kind"
            type="button"
            class="flex items-center gap-3 border border-border/70 bg-card p-3 text-left shadow-soft transition-colors hover:border-primary/40 hover:bg-accent/40"
            @click="reviewUserId = highlight.userId"
          >
            <span class="flex size-9 shrink-0 items-center justify-center bg-primary/10 text-primary">
              <component :is="HIGHLIGHT_ICONS[highlight.kind]" class="size-4.5" />
            </span>
            <span class="min-w-0">
              <span class="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{{ highlight.title }}</span>
              <span class="flex items-center gap-1.5 text-sm font-medium">
                <UserAvatar :user="memberById.get(highlight.userId)?.user" size="xs" />
                <span class="truncate">{{ memberById.get(highlight.userId)?.user.name }}</span>
              </span>
              <span class="block truncate text-xs text-muted-foreground">{{ highlight.detail }}</span>
            </span>
          </button>
        </div>
      </section>

      <EmptyState
        v-if="!report.members.length"
        :icon="Users"
        title="Nobody to review yet"
        description="Add people to the project and assign them work. Their delivery, timeliness and quality will show up here."
        class="border bg-card py-12"
      />

      <section v-else class="border border-border/70 bg-card shadow-soft">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold">Member review</h2>
            <p class="text-xs text-muted-foreground">Click a column to sort. Click a person for their full review: every task they finished, by module and sprint.</p>
          </div>
        </header>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[60rem] text-sm">
            <thead>
              <tr class="border-b bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <th class="w-12 px-4 py-2 font-semibold">#</th>
                <th class="px-3 py-2 font-semibold">Person</th>
                <th v-for="column in COLUMNS" :key="column.key" class="px-3 py-2 font-semibold" :class="column.align === 'right' && 'text-right'" :aria-sort="sortKey === column.key ? (sortAscending ? 'ascending' : 'descending') : 'none'">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground"
                    :class="sortKey === column.key && 'text-foreground'"
                    :title="column.hint"
                    @click="sortBy(column.key)"
                  >
                    {{ column.label }}
                    <span v-if="sortKey === column.key" aria-hidden="true">{{ sortAscending ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th class="px-4 py-2 font-semibold">Trend</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr
                v-for="row in rows"
                :key="row.user.id"
                class="cursor-pointer transition-colors hover:bg-accent/40"
                tabindex="0"
                :aria-label="`Open review for ${row.user.name}`"
                @click="reviewUserId = row.user.id"
                @keydown.enter="reviewUserId = row.user.id"
              >
                <td class="px-4 py-2.5">
                  <span v-if="row.rank" class="inline-flex size-6 items-center justify-center text-xs font-bold tabular-nums" :class="rankTone(row.rank)">{{ row.rank }}</span>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-3 py-2.5">
                  <span class="flex min-w-0 items-center gap-2.5">
                    <UserAvatar :user="row.user" size="md" />
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{{ row.user.name }}</span>
                      <span class="block truncate text-xs text-muted-foreground">{{ row.user.title || row.roles.map((role) => role[0]!.toUpperCase() + role.slice(1)).join(', ') }}</span>
                    </span>
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <span v-if="row.score !== null" class="flex items-center gap-2">
                    <span class="h-1.5 w-16 bg-muted"><span class="block h-full" :class="scoreTone(row.score)" :style="{ width: `${row.score}%` }" /></span>
                    <span class="w-7 font-semibold tabular-nums">{{ row.score }}</span>
                  </span>
                  <span v-else class="text-xs text-muted-foreground">No completed work</span>
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums">
                  <span class="font-semibold">{{ row.completed }}</span>
                  <span v-if="row.completedPoints" class="block text-xs text-muted-foreground">{{ row.completedPoints }} pts</span>
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums">
                  <template v-if="row.onTimeRate !== null">
                    <span :class="row.onTimeRate >= 80 ? 'text-success' : row.onTimeRate >= 50 ? '' : 'text-destructive'" class="font-medium">{{ row.onTimeRate }}%</span>
                    <span class="block text-xs text-muted-foreground">{{ row.onTime }}/{{ row.withDueDate }}</span>
                  </template>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums">{{ row.averageCycleDays === null ? '—' : `${row.averageCycleDays}d` }}</td>
                <td class="px-3 py-2.5 text-right tabular-nums" :class="!row.bugsFixed && 'text-muted-foreground'">{{ row.bugsFixed }}</td>
                <td class="px-3 py-2.5 text-right tabular-nums" :class="row.reopened ? 'font-medium text-destructive' : 'text-muted-foreground'">{{ row.reopened }}</td>
                <td class="px-3 py-2.5 text-right tabular-nums">{{ hours(row.loggedMinutes) }}</td>
                <td class="px-3 py-2.5 text-right tabular-nums" :class="!row.comments && 'text-muted-foreground'">{{ row.comments }}</td>
                <td class="px-3 py-2.5 text-right tabular-nums">
                  {{ row.open }}
                  <span v-if="row.overdue" class="block text-xs font-medium text-destructive">{{ row.overdue }} overdue</span>
                </td>
                <td class="px-4 py-2.5">
                  <TrendSparkline :values="row.trend" :label="`Completed per ${report.buckets[0]?.unit ?? 'week'}: ${row.trend.map((value, index) => `${bucketLabels[index]} ${value}`).join(', ')}`" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <MemberReviewSheet v-model:open="reviewOpen" :user-id="reviewUserId" :period="period" :project-id="projectId" />
  </div>
</template>
