<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  Home,
  LayoutGrid,
  ListTodo,
  Map,
  MessagesSquare,
  Pause,
  Play,
  SquareCheck,
  Video,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import WorkdayLoopDemo from '@/modules/marketing/components/WorkdayLoopDemo.vue'
import ShareTourProjectMock, { type TourProjectView } from './ShareTourProjectMock.vue'

const open = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    /** Register / analytics source for tour CTAs. */
    from?: string
    /** Full-width trigger for landing-style CTA stacks. */
    block?: boolean
  }>(),
  { from: 'product-tour', block: false },
)

interface TourStep {
  id: string
  label: string
  icon: Component
  view?: TourProjectView
  title: string
  text: string
  highlights: string[]
  interactive?: boolean
}

const STEPS: TourStep[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    view: 'home',
    title: 'Start the day on Home',
    text: 'The same morning loop you get after sign-in: standup → tasks → meetings → messages, with overdue and due-today work already waiting.',
    highlights: [
      'Day loop shows what to do next',
      'My work lists overdue and due-today cards',
      'Matches the real Home after you explore a sample',
      'One place instead of four tools',
    ],
  },
  {
    id: 'board',
    label: 'Board',
    icon: LayoutGrid,
    view: 'board',
    title: 'Drag work across the board',
    text: 'The sample Website launch project — columns, labels, due dates, assignees. Watch a card move from To do to In progress the way it does in the real app.',
    highlights: [
      'Cards match the sample project (DEMO keys)',
      'Status move settles with a short highlight',
      'Sprint context stays in the project chrome',
      'Open any card for the full issue panel',
    ],
  },
  {
    id: 'backlog',
    label: 'Backlog',
    icon: ListTodo,
    view: 'backlog',
    title: 'Backlog ready for the next sprint',
    text: 'Rank upcoming work, estimate points, and pull the right items into the active sprint without leaving the project.',
    highlights: [
      'Prioritized backlog with story points',
      'Pull work into the active sprint',
      'Keep scope honest before kickoff',
      'Same project chrome across every view',
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: SquareCheck,
    view: 'tasks',
    title: 'A list when you need density',
    text: 'Scan every issue in a compact table — status, assignee, and key — then jump back to the board when you need flow.',
    highlights: [
      'Filterable task table for the whole project',
      'Status and assignee at a glance',
      'Great for triage and bulk review',
      'Switches keep project context intact',
    ],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    icon: Map,
    view: 'roadmap',
    title: 'Roadmap across the quarter',
    text: 'See initiatives as a timeline so launches, experiments, and polish land in the right order.',
    highlights: [
      'Timeline bars for major initiatives',
      'Align marketing and engineering dates',
      'Spot overlaps before they hurt delivery',
      'Stakeholders understand the plan fast',
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    view: 'calendar',
    title: 'Calendar beside the work',
    text: 'Meetings and milestones live in the same project so the week matches what is on the board.',
    highlights: [
      'Project calendar with launch milestones',
      'Reviews and go-live dates in one place',
      'Less juggling between tools',
      'Keep the team synchronized',
    ],
  },
  {
    id: 'messages',
    label: 'Work chat',
    icon: MessagesSquare,
    view: 'messages',
    title: 'Chat inside the project',
    text: 'Channels stay next to the board — talk about DEMO-3 without losing the thread.',
    highlights: [
      'Project channels like #launch and #design',
      'Decisions stay near the work',
      'Fewer context switches',
      'Mentions that lead back to tasks',
    ],
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: Video,
    view: 'meetings',
    title: 'Meetings that feed the board',
    text: 'Join in the browser, then turn action items into tracked cards on the same project.',
    highlights: [
      'Browser video with the team',
      'Action items become board tasks',
      'Launch syncs stay connected to delivery',
      'Guests can join when you need them',
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    view: 'reports',
    title: 'Progress for the project',
    text: 'Done vs in-flight and velocity for this project — enough signal to steer without a separate BI tool.',
    highlights: [
      'Project health at a glance',
      'Velocity trend for the sprint',
      'Share progress with stakeholders',
      'Catch slowdowns early',
    ],
  },
  {
    id: 'workday',
    label: 'Workday',
    icon: ClipboardList,
    title: 'One loop every morning',
    text: 'Outside a single project, Vector runs standup → tasks → meetings → messages. Try the interactive preview.',
    highlights: [
      'Post standup blockers and plans',
      'Clear overdue and due-today work',
      'Turn meeting actions into tasks',
      'Close the loop in messages',
    ],
    interactive: true,
  },
]

const index = ref(0)
const playing = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const step = computed(() => STEPS[index.value]!)
const isFirst = computed(() => index.value === 0)
const isLast = computed(() => index.value === STEPS.length - 1)
const progress = computed(() => ((index.value + 1) / STEPS.length) * 100)

function stop() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function start() {
  stop()
  if (!playing.value || !open.value) return
  const dwell = index.value < 2 ? 4800 : 5500
  timer = setTimeout(() => {
    if (index.value >= STEPS.length - 1) {
      playing.value = false
      stop()
      return
    }
    index.value += 1
    start()
  }, dwell)
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) start()
  else stop()
}

function go(to: number) {
  index.value = to
  playing.value = false
  stop()
}

function next() {
  if (!isLast.value) go(index.value + 1)
}

function prev() {
  if (!isFirst.value) go(index.value - 1)
}

watch(open, (isOpen) => {
  if (isOpen) {
    index.value = 0
    playing.value = true
    start()
  } else {
    stop()
    playing.value = false
  }
})

onBeforeUnmount(stop)
</script>

<template>
  <Button
    v-if="props.block"
    type="button"
    variant="outline"
    size="lg"
    class="w-full gap-2"
    @click="open = true"
  >
    <Play class="size-4 fill-current" />
    Product tour
  </Button>
  <template v-else>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="hidden h-9 gap-1.5 rounded-full border-border/80 bg-card/90 px-3 text-xs font-semibold shadow-soft sm:inline-flex"
      @click="open = true"
    >
      <Play class="size-3.5 fill-current" />
      Product tour
    </Button>
    <Button
      type="button"
      variant="outline"
      size="icon"
      class="size-9 shrink-0 rounded-full border-border/80 bg-card/90 shadow-soft sm:hidden"
      aria-label="Open product tour"
      @click="open = true"
    >
      <Play class="size-3.5 fill-current" />
    </Button>
  </template>

  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[min(94dvh,56rem)] flex-col gap-0 overflow-hidden border-border/60 p-0 sm:max-w-6xl" hide-close>
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <div class="min-w-0">
          <DialogTitle class="text-base">See Vector in motion</DialogTitle>
          <DialogDescription class="text-xs">
            Home and the sample board first — then backlog, roadmap, chat, meetings, and reports.
          </DialogDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Close" @click="open = false">
          <X class="size-4" />
        </Button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          class="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 md:w-44 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:px-2 md:py-3"
          aria-label="Tour chapters"
        >
          <button
            v-for="(item, i) in STEPS"
            :key="item.id"
            type="button"
            class="inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors md:w-full"
            :class="i === index ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'"
            :aria-current="i === index ? 'step' : undefined"
            @click="go(i)"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-md"
              :class="i === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
            >
              <component :is="item.icon" class="size-3.5" />
            </span>
            <span class="whitespace-nowrap">{{ item.label }}</span>
          </button>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
            <div class="space-y-1">
              <p class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Chapter {{ index + 1 }} of {{ STEPS.length }} · {{ step.label }}
              </p>
              <h3 class="text-lg font-semibold tracking-tight sm:text-xl">{{ step.title }}</h3>
              <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground">{{ step.text }}</p>
            </div>

            <ShareTourProjectMock v-if="step.view" :view="step.view" />

            <ul class="grid gap-2 sm:grid-cols-2">
              <li
                v-for="point in step.highlights"
                :key="point"
                class="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 text-sm"
              >
                <Check class="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{{ point }}</span>
              </li>
            </ul>

            <WorkdayLoopDemo
              v-if="step.interactive"
              :cta-to="{ name: 'register', query: { from: props.from } }"
              cta-label="Start free workspace"
            />
          </div>
        </div>
      </div>

      <div class="relative shrink-0 border-t border-border/60">
        <div class="absolute inset-x-0 top-0 h-0.5 bg-muted">
          <div class="h-full bg-primary transition-[width] duration-500 ease-out" :style="{ width: `${progress}%` }" />
        </div>
        <div class="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <Button type="button" variant="ghost" size="icon" class="size-8" :aria-label="playing ? 'Pause tour' : 'Play tour'" @click="togglePlay">
            <Pause v-if="playing" class="size-4" />
            <Play v-else class="size-4 fill-current" />
          </Button>
          <Button type="button" variant="outline" size="sm" class="h-8 gap-1 rounded-full text-xs" :disabled="isFirst" @click="prev">
            <ArrowLeft class="size-3.5" />
            Back
          </Button>
          <Button type="button" variant="outline" size="sm" class="h-8 gap-1 rounded-full text-xs" :disabled="isLast" @click="next">
            Next
            <ArrowRight class="size-3.5" />
          </Button>
          <span class="hidden text-xs text-muted-foreground sm:inline">{{ step.label }}</span>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" class="h-8 rounded-full text-xs" as-child>
              <RouterLink :to="{ name: 'workday-preview' }" @click="open = false">Full workday page</RouterLink>
            </Button>
            <Button type="button" size="sm" class="h-8 rounded-full text-xs" as-child>
              <RouterLink to="/login" @click="open = false">Sign in</RouterLink>
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
