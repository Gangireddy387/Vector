<script setup lang="ts">
import { format } from 'date-fns'
import { ArrowRight, CalendarDays, ClipboardList, ListTodo, MessageCircle, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
import type { Issue } from '@/types/models'
import { useTodayAgenda } from '../composables/useTodayAgenda'
import type { DashboardData } from '../dashboard.api'
import { bucketOf } from '../my-work'

const props = defineProps<{ data: DashboardData }>()
const auth = useAuthStore()
const messages = useMessagesStore()
const agenda = useTodayAgenda()

const standup = computed(() => props.data.standupPending ?? [])
const unread = computed(() => messages.unreadTotal)
const showMessages = computed(() => auth.hasFeature('directMessages') || auth.hasFeature('teamChat'))
const meetings = computed(() => (agenda.items.value ?? []).filter((item) => item.kind === 'meeting'))
const events = computed(() => (agenda.items.value ?? []).filter((item) => item.kind === 'event'))

/** Tasks that belong in a morning pass: overdue, due today, or already in progress. */
const todayTasks = computed(() => {
  const list = (props.data.myWork ?? []).filter((issue) => {
    if (issue.status.category === 'done') return false
    const bucket = bucketOf(issue)
    return bucket === 'overdue' || bucket === 'today' || issue.status.category === 'in_progress'
  })
  return list.slice(0, 5)
})

const chips = computed(() => {
  const { dueToday, overdue, inProgress } = props.data.stats
  return [
    overdue ? { label: `${overdue} overdue`, tone: 'danger' as const, to: { name: 'issues', query: { assigneeId: 'me', overdue: 'true' } } } : null,
    dueToday ? { label: `${dueToday} due today`, tone: 'warn' as const, to: { name: 'issues', query: { assigneeId: 'me', sort: 'dueDate' } } } : null,
    inProgress ? { label: `${inProgress} in progress`, tone: 'info' as const, to: { name: 'issues', query: { assigneeId: 'me', statusCategory: 'in_progress' } } } : null,
    meetings.value.length ? { label: `${meetings.value.length} meeting${meetings.value.length === 1 ? '' : 's'}`, tone: 'default' as const, to: { name: 'meetings' } } : null,
    showMessages.value && unread.value ? { label: `${unread.value} unread`, tone: 'default' as const, to: { name: 'messages' } } : null,
    standup.value.length ? { label: 'Standup due', tone: 'primary' as const, to: { name: 'project-standup', params: { projectId: standup.value[0]!.projectId }, query: { date: standup.value[0]!.date } } } : null,
  ].filter(Boolean) as Array<{ label: string; tone: 'danger' | 'warn' | 'info' | 'primary' | 'default'; to: RouteLocationRaw }>
})

const toneClass: Record<string, string> = {
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  default: 'border-border bg-muted/50 text-foreground',
}

const taskHint = (issue: Issue) => {
  const bucket = bucketOf(issue)
  if (bucket === 'overdue') return 'Overdue'
  if (bucket === 'today') return 'Due today'
  if (issue.status.category === 'in_progress') return 'In progress'
  return issue.status.name
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
    <header class="flex h-12 items-center gap-2 border-b border-border px-4">
      <CalendarDays class="size-4 text-primary" />
      <h2 class="text-sm font-semibold">Today</h2>
      <span class="text-xs text-muted-foreground">Morning view · {{ format(new Date(), 'EEEE d MMM') }}</span>
      <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
        <RouterLink :to="{ name: 'calendar' }">Calendar <ArrowRight /></RouterLink>
      </Button>
    </header>

    <div class="space-y-4 p-4">
      <!-- Morning chips -->
      <div v-if="chips.length" class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="chip in chips"
          :key="chip.label"
          :to="chip.to"
          class="rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors hover:bg-accent"
          :class="toneClass[chip.tone]"
        >
          {{ chip.label }}
        </RouterLink>
      </div>
      <p v-else class="text-[13px] text-muted-foreground">Nothing urgent this morning. Capture a task or check Upcoming.</p>

      <!-- Standup CTA -->
      <div
        v-if="standup.length"
        class="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5 sm:flex-row sm:items-center"
      >
        <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><ClipboardList class="size-4" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold">Start your workday — post standup</p>
          <p class="truncate text-[12px] text-muted-foreground">
            {{ standup.map((item) => item.projectName).slice(0, 3).join(', ') }}
            <template v-if="standup.length > 3"> +{{ standup.length - 3 }}</template>
            · then clear tasks
          </p>
        </div>
        <Button size="sm" class="shrink-0 self-start sm:self-center" as-child>
          <RouterLink :to="{ name: 'project-standup', params: { projectId: standup[0]!.projectId }, query: { date: standup[0]!.date } }">
            Start my day
          </RouterLink>
        </Button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Tasks -->
        <div class="min-w-0 space-y-2">
          <div class="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <ListTodo class="size-3.5" /> My tasks
          </div>
          <ul v-if="todayTasks.length" class="divide-y divide-border/70 overflow-hidden rounded-lg border border-border">
            <li v-for="issue in todayTasks" :key="issue.id">
              <RouterLink
                :to="{ name: 'issues', query: { issue: issue.key } }"
                class="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50"
              >
                <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: issue.project?.color ?? 'var(--muted-foreground)' }" />
                <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ issue.key }} · {{ issue.title }}</span>
                <span
                  class="shrink-0 text-[11px]"
                  :class="bucketOf(issue) === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground'"
                >
                  {{ taskHint(issue) }}
                </span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">No overdue or due-today work.</p>
        </div>

        <!-- Meetings + DMs -->
        <div class="min-w-0 space-y-3">
          <div>
            <div class="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
              <Video class="size-3.5" /> Meetings & schedule
            </div>
            <div v-if="agenda.items.value === null" class="space-y-2">
              <Skeleton v-for="index in 2" :key="index" class="h-10 w-full" />
            </div>
            <ul v-else-if="meetings.length || events.length" class="divide-y divide-border/70 overflow-hidden rounded-lg border border-border">
              <li v-for="item in [...meetings, ...events].slice(0, 4)" :key="item.id">
                <RouterLink :to="item.to" class="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/50">
                  <span class="w-16 shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
                    <template v-if="item.start">{{ item.start }}</template>
                    <template v-else>All day</template>
                  </span>
                  <Video v-if="item.kind === 'meeting'" class="size-3.5 shrink-0 text-muted-foreground" />
                  <CalendarDays v-else class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ item.title }}</span>
                  <span v-if="item.live" class="rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-white">Live</span>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">Nothing scheduled today.</p>
          </div>

          <RouterLink
            v-if="showMessages"
            :to="{ name: 'messages' }"
            class="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-accent/50"
          >
            <MessageCircle class="size-4 shrink-0 text-sky-600 dark:text-sky-300" />
            <span class="min-w-0 flex-1 text-[13px] font-medium">
              <template v-if="unread">{{ unread }} unread in Messages</template>
              <template v-else>Messages · DMs & teams</template>
            </span>
            <ArrowRight class="size-3.5 text-muted-foreground" />
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
