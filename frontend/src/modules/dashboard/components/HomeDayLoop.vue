<script setup lang="ts">
import { ClipboardList, ListTodo, MessageCircle, Play, Video } from 'lucide-vue-next'
import { computed, onMounted, useTemplateRef } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
import type { DashboardData } from '../dashboard.api'

/**
 * Vector’s signature loop: standup → tasks → meetings → messages.
 * “Start my day” always points at the next incomplete step — the habit that makes this a workday OS.
 */
const props = defineProps<{ data: DashboardData; /** Invite / deep-link highlight from ?startDay=1 */ highlight?: boolean }>()
const auth = useAuthStore()
const messages = useMessagesStore()
const root = useTemplateRef<HTMLElement>('root')

onMounted(() => {
  if (!props.highlight) return
  root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

const standup = computed(() => props.data.standupPending ?? [])
const meetingActions = computed(() => props.data.meetingActions ?? [])
const unread = computed(() => messages.unreadTotal)
const showMessages = computed(() => auth.hasFeature('directMessages') || auth.hasFeature('teamChat'))
const showMeetings = computed(() => auth.hasFeature('meetings'))
const showStandup = computed(() => auth.hasFeature('chat'))

type Step = {
  key: string
  label: string
  detail: string
  icon: typeof ClipboardList
  to: RouteLocationRaw
  done: boolean
  urgent: boolean
  show: boolean
}

const steps = computed<Step[]>(() => {
  const { overdue, dueToday, inProgress } = props.data.stats
  const taskCount = overdue + dueToday + inProgress
  const standupDue = standup.value.length > 0
  const firstStandup = standup.value[0]
  const openActions = meetingActions.value.reduce((sum, item) => sum + item.openCount, 0)

  const taskDetail = (() => {
    if (!taskCount) return 'Inbox clear'
    const parts = [
      overdue ? `${overdue} overdue` : '',
      dueToday ? `${dueToday} due today` : '',
      !overdue && !dueToday && inProgress ? `${inProgress} in progress` : '',
    ].filter(Boolean)
    return parts.join(' · ') || `${taskCount} open`
  })()

  return [
    {
      key: 'standup',
      label: 'Standup',
      detail: standupDue
        ? `Post in ${standup.value.length === 1 ? firstStandup!.projectName : `${standup.value.length} projects`}`
        : showStandup.value
          ? 'Posted for today'
          : 'On Pro with chat',
      icon: ClipboardList,
      to: firstStandup
        ? { name: 'project-standup', params: { projectId: firstStandup.projectId }, query: { date: firstStandup.date } }
        : showStandup.value
          ? { name: 'home' }
          : { name: 'feature-locked', query: { feature: 'chat' } },
      done: showStandup.value && !standupDue,
      urgent: standupDue,
      show: true,
    },
    {
      key: 'tasks',
      label: 'Tasks',
      detail: taskDetail,
      icon: ListTodo,
      to: { name: 'issues', query: { assigneeId: 'me', sort: 'dueDate' } },
      done: taskCount === 0,
      urgent: overdue > 0,
      show: true,
    },
    {
      key: 'meetings',
      label: 'Meetings',
      detail: openActions
        ? `${openActions} action item${openActions === 1 ? '' : 's'} → tasks`
        : showMeetings.value
          ? 'No open follow-ups'
          : 'On Pro',
      icon: Video,
      to: !showMeetings.value
        ? { name: 'feature-locked', query: { feature: 'meetings' } }
        : openActions && meetingActions.value[0]
          ? { name: 'meeting-room', params: { meetingId: meetingActions.value[0].meetingId }, query: { focus: 'actions' } }
          : { name: 'meetings' },
      done: showMeetings.value && openActions === 0,
      urgent: openActions > 0,
      show: true,
    },
    {
      key: 'messages',
      label: 'Messages',
      detail: unread.value ? `${unread.value} unread` : showMessages.value ? 'Caught up' : 'On Pro',
      icon: MessageCircle,
      to: showMessages.value
        ? { name: 'messages' }
        : { name: 'feature-locked', query: { feature: ['directMessages', 'teamChat'] } },
      done: showMessages.value && unread.value === 0,
      urgent: unread.value > 0,
      show: true,
    },
  ]
})

const next = computed(() => steps.value.find((step) => step.urgent) ?? steps.value.find((step) => !step.done) ?? null)
const doneCount = computed(() => steps.value.filter((step) => step.done).length)
const allDone = computed(() => doneCount.value === steps.value.length)
const ctaLabel = computed(() => {
  if (allDone.value) return 'Workday clear'
  if (!next.value) return 'Start my day'
  if (next.value.key === 'standup' && next.value.urgent) return 'Start my day'
  return `Continue · ${next.value.label}`
})
</script>

<template>
  <section
    ref="root"
    class="scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-soft"
    :class="highlight ? 'border-primary ring-2 ring-primary/25' : 'border-border'"
    aria-label="Your workday loop"
  >
    <header class="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold">{{ highlight ? 'Start my day' : 'Workday loop' }}</h2>
          <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {{ doneCount }}/{{ steps.length }}
          </span>
          <span v-if="highlight" class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Welcome</span>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{
            highlight
              ? 'You’re in. Hit Start my day — standup, then tasks, meetings and messages.'
              : allDone
                ? 'You’re through today’s loop. Capture anything new or take a break.'
                : 'Standup → tasks → meetings → messages — Vector’s daily rhythm.'
          }}
        </p>
      </div>
      <Button v-if="next && !allDone" size="sm" class="shrink-0 self-start sm:self-center" as-child>
        <RouterLink :to="next.to"><Play /> {{ ctaLabel }}</RouterLink>
      </Button>
      <Button v-else size="sm" variant="outline" class="shrink-0 self-start sm:self-center" as-child>
        <RouterLink :to="{ name: 'home' }">{{ ctaLabel }}</RouterLink>
      </Button>
    </header>

    <ol class="grid sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border/70">
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="border-b border-border/70 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0"
      >
        <RouterLink
          :to="step.to"
          class="flex h-full flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/50"
          :class="[step.urgent && 'bg-primary/[0.03]', next?.key === step.key && !step.done && 'ring-1 ring-inset ring-primary/25']"
        >
          <span class="flex items-center gap-2">
            <span
              class="flex size-7 items-center justify-center rounded-md"
              :class="
                step.urgent
                  ? 'bg-primary/15 text-primary'
                  : step.done
                    ? 'bg-success/15 text-success'
                    : 'bg-muted text-muted-foreground'
              "
            >
              <component :is="step.icon" class="size-3.5" />
            </span>
            <span class="text-[11px] font-medium text-muted-foreground tabular-nums">{{ index + 1 }}</span>
            <span class="text-[13px] font-semibold">{{ step.label }}</span>
            <span
              v-if="step.urgent"
              class="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
            >
              Now
            </span>
            <span
              v-else-if="step.done"
              class="ml-auto rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success"
            >
              Done
            </span>
          </span>
          <span class="truncate pl-9 text-[12px] text-muted-foreground">{{ step.detail }}</span>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>
