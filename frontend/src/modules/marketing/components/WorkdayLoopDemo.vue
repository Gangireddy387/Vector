<script setup lang="ts">
import {
  Check,
  ClipboardList,
  Clock3,
  ListTodo,
  MessageCircle,
  Play,
  Video,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'

defineProps<{
  ctaTo: Record<string, unknown>
  ctaLabel: string
  /** Optional brand tint for invite pages. */
  brandColor?: string | null
}>()

const STEPS = [
  {
    icon: ClipboardList,
    label: 'Standup',
    detail: 'Post blockers and plans',
    sample: 'Blocked on API keys · Shipping login polish today · Need design review by noon',
  },
  {
    icon: ListTodo,
    label: 'Tasks',
    detail: 'Clear overdue and due today',
    sample: '2 overdue · 4 due today · Focus: VEC-18 Invite flow',
  },
  {
    icon: Video,
    label: 'Meetings',
    detail: 'Turn actions into tasks',
    sample: 'Standup sync 10:00 · Follow-ups become tasks automatically',
  },
  {
    icon: MessageCircle,
    label: 'Messages',
    detail: 'Close the loop with people',
    sample: '3 unread · @you in #design · DM from Priya about blockers',
  },
] as const

const SAMPLE_TASKS = [
  { id: 't1', key: 'DEMO-4', title: 'Set up the contact form backend', due: 'Overdue', tone: 'text-destructive' },
  { id: 't2', key: 'DEMO-12', title: 'Polish workday loop layout', due: 'Today', tone: 'text-amber-700 dark:text-amber-300' },
  { id: 't3', key: 'DEMO-18', title: 'Wire standup → board handoff', due: 'Today', tone: 'text-amber-700 dark:text-amber-300' },
  { id: 't4', key: 'DEMO-21', title: 'Share workday loop with stakeholders', due: 'Tomorrow', tone: 'text-muted-foreground' },
] as const

const SAMPLE_ACTIONS = [
  { id: 'a1', text: 'Ship workday CTA copy', owner: 'You' },
  { id: 'a2', text: 'Ask design for logo crop', owner: 'Priya' },
  { id: 'a3', text: 'Confirm API keys with DevOps', owner: 'Sam' },
] as const

const SAMPLE_MESSAGES = [
  { id: 'm1', who: 'Priya', channel: '#design', text: '@you can we tighten the standup sample before noon?', unread: true },
  { id: 'm2', who: 'Sam', channel: 'DM', text: 'Blocked on API keys — can you unblock?', unread: true },
  { id: 'm3', who: 'Alex', channel: '#launch', text: 'Workday loop looks good. Ship it.', unread: false },
] as const

const active = ref(0)
const posted = ref(false)
const draft = ref('')
const doneTasks = ref<string[]>([])
const claimedActions = ref<string[]>([])
const replied = ref(false)

const activeStep = computed(() => STEPS[active.value])
const openTaskCount = computed(() => SAMPLE_TASKS.length - doneTasks.value.length)

function select(index: number) {
  active.value = index
}

function postStandup() {
  if (!draft.value.trim()) draft.value = STEPS[0].sample
  posted.value = true
}

function toggleTask(id: string) {
  doneTasks.value = doneTasks.value.includes(id)
    ? doneTasks.value.filter((item) => item !== id)
    : [...doneTasks.value, id]
}

function claimAction(id: string) {
  if (claimedActions.value.includes(id)) return
  claimedActions.value = [...claimedActions.value, id]
}

function replyPreview() {
  replied.value = true
}
</script>

<template>
  <section
    class="w-full overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft"
    aria-label="Workday loop preview"
    :style="brandColor ? { borderColor: `${brandColor}55` } : undefined"
  >
    <header class="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-[15px] font-semibold tracking-tight">Start my day</h2>
          <span class="rounded-md bg-primary/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
            Preview
          </span>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">Click each step — try standup, tasks, meetings, and messages.</p>
      </div>
      <Button size="sm" class="h-9 shrink-0 gap-1.5" as-child>
        <RouterLink :to="ctaTo"><Play class="size-3.5 fill-current" /> {{ ctaLabel }}</RouterLink>
      </Button>
    </header>

    <ol class="grid grid-cols-2 gap-2 border-b border-border/80 p-3 sm:grid-cols-4 sm:gap-2.5 sm:p-4" role="list">
      <li v-for="(step, index) in STEPS" :key="step.label" class="min-w-0">
        <button
          type="button"
          class="flex h-full min-h-[5.5rem] w-full flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors sm:min-h-[6rem] sm:px-3.5"
          :class="
            active === index
              ? 'border-primary/35 bg-primary/8 shadow-soft'
              : 'border-border/70 bg-background/60 hover:border-border hover:bg-muted/40'
          "
          :aria-pressed="active === index"
          @click="select(index)"
        >
          <span class="flex w-full items-center gap-2">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-lg"
              :class="active === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
            >
              <component :is="step.icon" class="size-3.5" />
            </span>
            <span class="min-w-0">
              <span class="flex items-baseline gap-1.5">
                <span class="text-[11px] font-medium tabular-nums text-muted-foreground">{{ index + 1 }}</span>
                <span class="truncate text-[13px] font-semibold leading-none">{{ step.label }}</span>
              </span>
            </span>
          </span>
          <span class="line-clamp-2 w-full text-[11px] leading-snug text-muted-foreground sm:text-[12px]">
            {{ step.detail }}
          </span>
        </button>
      </li>
    </ol>

    <div class="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <div class="space-y-2">
        <p class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {{ activeStep.label }} · live sample
        </p>
        <p class="rounded-xl border border-border/70 bg-muted/35 px-3.5 py-3 text-[13px] leading-relaxed text-foreground/90">
          {{ activeStep.sample }}
        </p>
      </div>

      <!-- Standup -->
      <div v-if="active === 0" class="space-y-2.5 border-t border-border/70 pt-3.5">
        <label class="block text-[13px] font-medium" for="demo-standup">Try a standup draft</label>
        <textarea
          id="demo-standup"
          v-model="draft"
          rows="3"
          class="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20"
          placeholder="Yesterday / today / blockers…"
        />
        <div class="flex flex-wrap items-center gap-2.5">
          <Button size="sm" class="h-9" :disabled="posted" @click="postStandup">
            {{ posted ? 'Posted for today' : 'Post preview' }}
          </Button>
          <span v-if="posted" class="text-xs font-medium text-success">Posted for today — join to make it real for your team.</span>
        </div>
      </div>

      <!-- Tasks -->
      <div v-else-if="active === 1" class="space-y-3 border-t border-border/70 pt-3.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[13px] font-medium">Today’s queue — click to clear</p>
          <span class="text-xs text-muted-foreground tabular-nums">{{ openTaskCount }} open</span>
        </div>
        <ul class="space-y-2">
          <li v-for="task in SAMPLE_TASKS" :key="task.id">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
              :class="doneTasks.includes(task.id) && 'opacity-60'"
              @click="toggleTask(task.id)"
            >
              <span
                class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border"
                :class="doneTasks.includes(task.id) ? 'border-success bg-success text-success-foreground' : 'border-border'"
              >
                <Check v-if="doneTasks.includes(task.id)" class="size-3" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span class="font-mono text-[11px] text-muted-foreground">{{ task.key }}</span>
                  <span class="text-[13px] font-medium" :class="doneTasks.includes(task.id) && 'line-through'">{{ task.title }}</span>
                </span>
                <span class="mt-0.5 inline-flex items-center gap-1 text-[11px]" :class="task.tone">
                  <Clock3 class="size-3" />
                  {{ task.due }}
                </span>
              </span>
            </button>
          </li>
        </ul>
        <p class="text-xs text-muted-foreground">In Vector, clearing these updates the board for everyone.</p>
      </div>

      <!-- Meetings -->
      <div v-else-if="active === 2" class="space-y-3 border-t border-border/70 pt-3.5">
        <div class="rounded-xl border border-border/70 bg-background/70 px-3.5 py-3">
          <p class="text-[13px] font-semibold">Launch sync · today 10:00</p>
          <p class="mt-0.5 text-xs text-muted-foreground">4 people · browser video · notes stay on the project</p>
        </div>
        <p class="text-[13px] font-medium">Action items → click to turn into tasks</p>
        <ul class="space-y-2">
          <li v-for="item in SAMPLE_ACTIONS" :key="item.id" class="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5">
            <span class="min-w-0 flex-1 text-[13px]">{{ item.text }}</span>
            <span class="text-[11px] text-muted-foreground">{{ item.owner }}</span>
            <Button
              type="button"
              size="sm"
              class="h-8"
              variant="outline"
              :disabled="claimedActions.includes(item.id)"
              @click="claimAction(item.id)"
            >
              {{ claimedActions.includes(item.id) ? 'On the board' : 'Make task' }}
            </Button>
          </li>
        </ul>
        <p v-if="claimedActions.length" class="text-xs font-medium text-success">
          {{ claimedActions.length }} action{{ claimedActions.length === 1 ? '' : 's' }} queued as tasks — join to keep them.
        </p>
      </div>

      <!-- Messages -->
      <div v-else class="space-y-3 border-t border-border/70 pt-3.5">
        <p class="text-[13px] font-medium">Unread that need a reply</p>
        <ul class="space-y-2">
          <li
            v-for="msg in SAMPLE_MESSAGES"
            :key="msg.id"
            class="rounded-xl border border-border/70 px-3 py-2.5"
            :class="msg.unread ? 'bg-primary/5 border-primary/20' : 'bg-background/70'"
          >
            <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span class="font-semibold text-foreground">{{ msg.who }}</span>
              <span>·</span>
              <span>{{ msg.channel }}</span>
              <span v-if="msg.unread" class="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                New
              </span>
            </div>
            <p class="mt-1 text-[13px] leading-relaxed">{{ msg.text }}</p>
          </li>
        </ul>
        <div class="flex flex-wrap items-center gap-2.5">
          <Button type="button" size="sm" class="h-9" :disabled="replied" @click="replyPreview">
            {{ replied ? 'Reply queued' : 'Reply in preview' }}
          </Button>
          <span v-if="replied" class="text-xs font-medium text-success">Reply stays with the task thread when you join.</span>
        </div>
      </div>
    </div>
  </section>
</template>
