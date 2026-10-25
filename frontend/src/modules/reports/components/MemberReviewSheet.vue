<script setup lang="ts">
import { AlarmClock, CircleCheck, RotateCcw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ColumnChart from '@/components/common/charts/ColumnChart.vue'
import HorizontalBarList from '@/components/common/charts/HorizontalBarList.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { describeDue, formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { describePeriod, type Period } from '../period'
import { type MemberReview, reportsApi } from '../reports.api'

const props = defineProps<{ userId: string | null; period: Period; projectId?: string }>()
const open = defineModel<boolean>('open', { default: false })

const review = ref<MemberReview | null>(null)
const errorMessage = ref('')
const isLoading = ref(false)
const list = ref<'completed' | 'open' | 'reopened'>('completed')

watch(
  () => [props.userId, props.period.from, props.period.to, props.projectId] as const,
  async ([userId]) => {
    if (!userId) return
    isLoading.value = true
    errorMessage.value = ''
    list.value = 'completed'
    try {
      review.value = await reportsApi.memberReview(userId, { ...props.period, projectId: props.projectId })
    } catch (error) {
      review.value = null
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  },
  { immediate: true },
)

const member = computed(() => review.value?.member ?? null)
const hours = (minutes: number) => (minutes ? `${Math.round((minutes / 60) * 10) / 10}h` : '0h')

const versusTeam = computed(() => {
  const average = review.value?.team.averageCompleted
  if (!member.value || !average) return null
  const ratio = Math.round((member.value.completed / average) * 10) / 10
  return ratio === 1 ? 'Same as the team average' : `${ratio}× the team average (${average})`
})

const facts = computed(() => {
  const row = member.value
  if (!row) return []
  return [
    { label: 'Issues completed', value: row.completed, hint: versusTeam.value },
    { label: 'Story points', value: row.completedPoints || '—', hint: row.highPriorityDone ? `${row.highPriorityDone} high-priority issues` : null },
    { label: 'On time', value: row.onTimeRate === null ? '—' : `${row.onTimeRate}%`, hint: row.withDueDate ? `${row.onTime} of ${row.withDueDate} met the due date` : 'No due dates set' },
    { label: 'Cycle time', value: row.averageCycleDays === null ? '—' : `${row.averageCycleDays} days`, hint: 'From starting work to done' },
    { label: 'Bugs fixed', value: row.bugsFixed, hint: null },
    { label: 'Reopened', value: row.reopened, hint: row.reopened ? 'Finished work that came back' : 'Nothing came back', danger: row.reopened > 0 },
    { label: 'Time logged', value: hours(row.loggedMinutes), hint: null },
    { label: 'Collaboration', value: row.comments, hint: `comments · ${row.created} issues raised` },
  ]
})

const trendLabels = computed(() =>
  (review.value?.buckets ?? []).map((bucket) => (bucket.unit === 'month' ? formatDate(bucket.start, 'MMM') : formatDate(bucket.start, 'd MMM'))),
)
const moduleBars = computed(() =>
  (review.value?.byModule ?? []).map((row) => ({
    label: row.module ? `${row.module.key} ${row.module.title}` : 'Not in a module',
    value: row.completed,
    hint: row.points ? `${row.points} pts` : undefined,
    color: row.module ? 'var(--primary)' : 'var(--muted-foreground)',
  })),
)
const sprintBars = computed(() =>
  (review.value?.bySprint ?? []).map((row) => ({
    label: row.sprint?.name ?? 'Outside sprints',
    value: row.completed,
    hint: row.points ? `${row.points} pts` : undefined,
    color: row.sprint ? 'var(--info)' : 'var(--muted-foreground)',
  })),
)
const projectBars = computed(() =>
  (member.value?.projects ?? []).map((row) => ({ label: row.project.name, value: row.completed, hint: row.points ? `${row.points} pts` : undefined, color: row.project.color })),
)
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="w-full gap-0 overflow-y-auto sm:max-w-2xl">
      <SheetHeader class="border-b pr-12">
        <template v-if="member">
          <div class="flex items-center gap-3">
            <UserAvatar :user="member.user" size="lg" />
            <div class="min-w-0 flex-1">
              <SheetTitle class="truncate">{{ member.user.name }}</SheetTitle>
              <SheetDescription class="truncate">{{ member.user.title || member.user.email }}</SheetDescription>
            </div>
            <div v-if="member.score !== null" class="text-right">
              <p class="text-2xl leading-none font-semibold tabular-nums">{{ member.score }}</p>
              <p class="text-xs text-muted-foreground">#{{ member.rank }} of {{ review?.team.people }} · score</p>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">{{ describePeriod(review!.period) }}</p>
        </template>
        <template v-else>
          <SheetTitle>Member review</SheetTitle>
          <SheetDescription>Loading…</SheetDescription>
        </template>
      </SheetHeader>

      <p v-if="errorMessage" class="m-4 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

      <div v-if="isLoading && !review" class="space-y-3 p-4">
        <Skeleton class="h-28 w-full" />
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-60 w-full" />
      </div>

      <div v-else-if="review && member" class="space-y-5 p-4 transition-opacity" :class="isLoading && 'opacity-60'">
        <dl class="grid grid-cols-2 gap-px border bg-border sm:grid-cols-4">
          <div v-for="fact in facts" :key="fact.label" class="bg-card p-3">
            <dt class="text-xs text-muted-foreground">{{ fact.label }}</dt>
            <dd class="text-lg font-semibold tabular-nums" :class="fact.danger && 'text-destructive'">{{ fact.value }}</dd>
            <dd v-if="fact.hint" class="text-[11px] leading-snug text-muted-foreground">{{ fact.hint }}</dd>
          </div>
        </dl>

        <section v-if="review.buckets.length > 1">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Completed per {{ review.buckets[0]?.unit }}</h3>
          <ColumnChart :labels="trendLabels" :series="[{ name: 'Completed', color: 'var(--primary)', values: member.trend }]" :height="150" />
        </section>

        <div class="grid gap-5 sm:grid-cols-2">
          <section>
            <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">By module</h3>
            <HorizontalBarList :items="moduleBars" empty-text="Nothing completed" />
          </section>
          <section>
            <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">By sprint</h3>
            <HorizontalBarList :items="sprintBars" empty-text="Nothing completed" />
          </section>
          <section v-if="projectBars.length > 1" class="sm:col-span-2">
            <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">By project</h3>
            <HorizontalBarList :items="projectBars" />
          </section>
        </div>

        <section>
          <Tabs v-model="list" class="mb-2">
            <TabsList class="h-8">
              <TabsTrigger value="completed" class="text-xs"><CircleCheck class="size-3.5" /> Completed {{ review.completed.length }}</TabsTrigger>
              <TabsTrigger value="open" class="text-xs"><AlarmClock class="size-3.5" /> Open now {{ review.open.length }}</TabsTrigger>
              <TabsTrigger value="reopened" class="text-xs"><RotateCcw class="size-3.5" /> Reopened {{ review.reopened.length }}</TabsTrigger>
            </TabsList>
          </Tabs>

          <ul v-if="list === 'completed'" class="divide-y border">
            <li v-for="issue in review.completed" :key="issue.id" class="flex items-start gap-3 px-3 py-2.5 text-sm">
              <IssueTypeIcon :type="issue.type" class="mt-0.5" />
              <div class="min-w-0 flex-1">
                <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="flex min-w-0 gap-2 hover:underline">
                  <span class="shrink-0 font-mono text-xs leading-5 text-muted-foreground">{{ issue.key }}</span>
                  <span class="truncate">{{ issue.title }}</span>
                </RouterLink>
                <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>Done {{ formatDate(issue.completedAt, 'd MMM yyyy') }}</span>
                  <span v-if="issue.cycleDays !== null">· {{ issue.cycleDays }}d cycle</span>
                  <span v-if="issue.module">· {{ issue.module.title }}</span>
                  <span v-if="issue.sprint">· {{ issue.sprint.name }}</span>
                </p>
              </div>
              <span v-if="issue.storyPoints" class="shrink-0 bg-muted px-1.5 text-xs font-semibold tabular-nums">{{ issue.storyPoints }}</span>
              <span
                v-if="issue.onTime !== null"
                class="shrink-0 border px-1.5 text-[11px] font-semibold"
                :class="issue.onTime ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'"
              >
                {{ issue.onTime ? 'On time' : 'Late' }}
              </span>
            </li>
            <li v-if="!review.completed.length" class="px-3 py-6 text-center text-sm text-muted-foreground">Nothing completed in this period.</li>
          </ul>

          <ul v-else-if="list === 'open'" class="divide-y border">
            <li v-for="issue in review.open" :key="issue.id" class="flex items-start gap-3 px-3 py-2.5 text-sm">
              <IssueTypeIcon :type="issue.type" class="mt-0.5" />
              <div class="min-w-0 flex-1">
                <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="flex min-w-0 gap-2 hover:underline">
                  <span class="shrink-0 font-mono text-xs leading-5 text-muted-foreground">{{ issue.key }}</span>
                  <span class="truncate">{{ issue.title }}</span>
                </RouterLink>
                <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{{ issue.status?.name }}</span>
                  <span v-if="issue.dueDate" :class="issue.overdue && 'font-medium text-destructive'">· {{ describeDue(issue.dueDate) }}</span>
                  <span v-if="issue.module">· {{ issue.module.title }}</span>
                </p>
              </div>
            </li>
            <li v-if="!review.open.length" class="px-3 py-6 text-center text-sm text-muted-foreground">No open work assigned.</li>
          </ul>

          <ul v-else class="divide-y border">
            <li v-for="issue in review.reopened" :key="issue.id" class="flex items-start gap-3 px-3 py-2.5 text-sm">
              <IssueTypeIcon :type="issue.type" class="mt-0.5" />
              <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="flex min-w-0 flex-1 gap-2 hover:underline">
                <span class="shrink-0 font-mono text-xs leading-5 text-muted-foreground">{{ issue.key }}</span>
                <span class="truncate">{{ issue.title }}</span>
              </RouterLink>
              <span class="shrink-0 text-xs text-muted-foreground">{{ issue.status?.name }}</span>
            </li>
            <li v-if="!review.reopened.length" class="px-3 py-6 text-center text-sm text-muted-foreground">No finished work was reopened in this period.</li>
          </ul>
        </section>
      </div>
    </SheetContent>
  </Sheet>
</template>
