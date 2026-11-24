<script setup lang="ts">
import {
  BarChart3,
  Bug,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  LayoutGrid,
  ListTodo,
  Map,
  MessageSquare,
  Rocket,
  Sparkles,
  SquareCheck,
  Video,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type TourProjectView =
  | 'home'
  | 'board'
  | 'backlog'
  | 'tasks'
  | 'roadmap'
  | 'calendar'
  | 'messages'
  | 'meetings'
  | 'reports'

const props = defineProps<{ view: TourProjectView }>()

const TABS = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'backlog', label: 'Backlog', icon: ListTodo },
  { id: 'tasks', label: 'Tasks', icon: SquareCheck },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'messages', label: 'Work chat', icon: MessageSquare },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
] as const

const activeTab = computed(() => {
  const map: Record<TourProjectView, string> = {
    home: 'board',
    board: 'board',
    backlog: 'backlog',
    tasks: 'tasks',
    roadmap: 'roadmap',
    calendar: 'calendar',
    messages: 'messages',
    meetings: 'meetings',
    reports: 'reports',
  }
  return map[props.view]
})

/** Board demo: a card slides from To do → In progress when this step is shown. */
const cardMoved = ref(false)
let moveTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.view,
  (view) => {
    if (moveTimer) clearTimeout(moveTimer)
    cardMoved.value = false
    if (view === 'board') {
      moveTimer = setTimeout(() => {
        cardMoved.value = true
      }, 650)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (moveTimer) clearTimeout(moveTimer)
})

const HOME_LOOP = [
  { label: 'Standup', hint: 'Posted', done: true },
  { label: 'Tasks', hint: '3 open', active: true },
  { label: 'Meetings', hint: '10:00' },
  { label: 'Messages', hint: '2 unread' },
] as const

const HOME_WORK = [
  { key: 'DEMO-6', title: 'Hero image loads slowly on phones', due: 'Overdue', tone: 'text-destructive' },
  { key: 'DEMO-4', title: 'Set up the contact form backend', due: 'Due today', tone: 'text-amber-700 dark:text-amber-300' },
  { key: 'DEMO-5', title: 'Write copy for the pricing page', due: 'Due today', tone: 'text-amber-700 dark:text-amber-300' },
  { key: 'DEMO-3', title: 'Build the responsive navigation', due: 'In review', tone: 'text-muted-foreground' },
] as const

const COLUMNS = [
  {
    name: 'To do',
    color: '#3b82f6',
    cards: [
      { key: 'DEMO-6', title: 'Hero image loads slowly on phones', type: 'bug', labels: [{ name: 'frontend', color: '#3b82f6' }], due: '17 Nov', dueTone: 'text-destructive', who: 'GY', whoTone: 'bg-emerald-500' },
      { key: 'DEMO-7', title: 'Add analytics and cookie consent', type: 'task', labels: [{ name: 'frontend', color: '#3b82f6' }, { name: 'backend', color: '#f97316' }], due: '23 Nov', dueTone: 'text-destructive', who: 'GY', whoTone: 'bg-emerald-500' },
      { key: 'DEMO-8', title: 'Test on Safari, Chrome and Firefox', type: 'task', labels: [{ name: 'frontend', color: '#3b82f6' }], due: '26 Nov', dueTone: 'text-amber-600', who: 'GY', whoTone: 'bg-emerald-500' },
    ],
  },
  {
    name: 'In progress',
    color: '#38bdf8',
    cards: [
      { key: 'DEMO-4', title: 'Set up the contact form backend', type: 'task', labels: [{ name: 'backend', color: '#f97316' }], due: '20 Nov', dueTone: 'text-destructive', who: 'GY', whoTone: 'bg-emerald-500' },
      { key: 'DEMO-5', title: 'Write copy for the pricing page', type: 'task', labels: [{ name: 'design', color: '#ec4899' }], due: '15 Nov', dueTone: 'text-destructive', who: 'GY', whoTone: 'bg-emerald-500' },
    ],
  },
  {
    name: 'In review',
    color: '#a78bfa',
    cards: [
      { key: 'DEMO-3', title: 'Build the responsive navigation', type: 'task', labels: [{ name: 'frontend', color: '#3b82f6' }], due: '19 Nov', dueTone: 'text-destructive', who: 'GY', whoTone: 'bg-emerald-500' },
    ],
  },
  {
    name: 'Done',
    color: '#22c55e',
    cards: [
      { key: 'DEMO-1', title: 'Agree the launch goals and success metrics', type: 'task', labels: [{ name: 'design', color: '#ec4899' }], due: '12 Nov', dueTone: 'text-muted-foreground', who: 'GY', whoTone: 'bg-emerald-500' },
      { key: 'DEMO-2', title: 'Design the new homepage', type: 'task', labels: [{ name: 'design', color: '#ec4899' }], due: '15 Nov', dueTone: 'text-muted-foreground', who: 'GY', whoTone: 'bg-emerald-500' },
    ],
  },
]

const BACKLOG = [
  { key: 'DEMO-12', title: 'Launch checklist for go-live', points: 5, priority: 'High' },
  { key: 'DEMO-11', title: 'Wire SEO meta tags on all pages', points: 3, priority: 'Medium' },
  { key: 'DEMO-10', title: 'Prepare customer email sequences', points: 2, priority: 'Low' },
]

const ROADMAP = [
  { name: 'Website launch', span: 'col-span-3', tone: 'bg-sky-500/80' },
  { name: 'Pricing experiments', span: 'col-span-2 col-start-3', tone: 'bg-violet-500/80' },
  { name: 'Post-launch polish', span: 'col-span-2 col-start-4', tone: 'bg-emerald-500/80' },
]
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border/80 bg-card shadow-elevated">
    <!-- Home (workspace morning) -->
    <template v-if="view === 'home'">
      <div class="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/80 px-3 py-2.5">
        <Sparkles class="size-3.5 text-primary" />
        <p class="truncate text-sm font-semibold">Home · Your workday</p>
        <span class="ml-auto text-[11px] text-muted-foreground">Sample org</span>
      </div>
      <div class="space-y-3 bg-muted/20 p-3">
        <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div
            v-for="step in HOME_LOOP"
            :key="step.label"
            class="rounded-lg border px-2.5 py-2 transition-colors"
            :class="
              'active' in step && step.active
                ? 'border-primary/40 bg-primary/10'
                : 'done' in step && step.done
                  ? 'border-border/60 bg-card/80'
                  : 'border-border/50 bg-card/50'
            "
          >
            <p class="text-[11px] font-semibold">{{ step.label }}</p>
            <p class="text-[10px] text-muted-foreground">{{ step.hint }}</p>
          </div>
        </div>
        <div class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          <div class="flex h-9 items-center border-b border-border/60 px-3">
            <p class="text-xs font-semibold">My work</p>
            <span class="ml-auto text-[10px] text-muted-foreground tabular-nums">4 open</span>
          </div>
          <ul class="divide-y divide-border/50">
            <li v-for="(row, i) in HOME_WORK" :key="row.key" class="flex items-center gap-2 px-3 py-2" :class="i === 0 && 'bg-primary/[0.04]'">
              <ListTodo class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="text-[11px] text-muted-foreground tabular-nums">{{ row.key }}</span>
              <span class="min-w-0 flex-1 truncate text-[12px] font-medium">{{ row.title }}</span>
              <span class="shrink-0 text-[10px] font-medium" :class="row.tone">{{ row.due }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template v-else>
    <!-- Project chrome -->
    <div class="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/80 px-3 py-2.5">
      <span class="size-2.5 rounded-full bg-sky-500 ring-2 ring-sky-500/20" />
      <p class="truncate text-sm font-semibold">Sample: Website launch</p>
      <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">DEMO</span>
      <span class="hidden rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">DEMO Sprint 1 · Active</span>
      <span class="ml-auto inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
        Display
        <ChevronDown class="size-3" />
      </span>
    </div>

    <div class="flex gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 px-2 py-1.5">
      <span
        v-for="tab in TABS"
        :key="tab.id"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
        :class="tab.id === activeTab ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground'"
      >
        <component :is="tab.icon" class="size-3.5" />
        {{ tab.label }}
      </span>
    </div>

    <!-- Board -->
    <div v-if="view === 'board'" class="grid grid-cols-2 gap-2 bg-muted/30 p-2 sm:grid-cols-4 sm:gap-2.5 sm:p-3">
      <section v-for="column in COLUMNS" :key="column.name" class="min-w-0 rounded-lg border border-border/50 bg-muted/40 p-1.5">
        <header class="mb-1.5 flex items-center gap-1.5 px-1">
          <span class="size-2 rounded-full" :style="{ backgroundColor: column.color }" />
          <span class="truncate text-[11px] font-semibold">{{ column.name }}</span>
          <span class="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {{
              column.name === 'To do' && cardMoved
                ? column.cards.length - 1
                : column.name === 'In progress' && cardMoved
                  ? column.cards.length + 1
                  : column.cards.length
            }}
          </span>
        </header>
        <div class="space-y-1.5">
          <article
            v-for="card in column.cards"
            :key="card.key"
            class="rounded-md border bg-card px-2 py-1.5 shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition-all duration-500 ease-out"
            :class="[
              card.key === 'DEMO-6' && column.name === 'To do' && cardMoved
                ? 'pointer-events-none scale-95 opacity-0'
                : 'border-border/70 opacity-100',
              card.key === 'DEMO-6' && column.name === 'To do' && !cardMoved && 'ring-2 ring-primary/30',
            ]"
          >
            <div class="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Bug v-if="card.type === 'bug'" class="size-3 text-rose-500" />
              <CheckSquare v-else class="size-3 text-sky-500" />
              <span class="font-medium tabular-nums">{{ card.key }}</span>
            </div>
            <p class="line-clamp-2 text-[11px] leading-snug font-medium">{{ card.title }}</p>
            <div class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="label in card.labels"
                :key="label.name"
                class="inline-flex items-center gap-1 rounded-full bg-muted/80 px-1.5 py-px text-[9px] font-medium"
              >
                <span class="size-1.5 rounded-full" :style="{ backgroundColor: label.color }" />
                {{ label.name }}
              </span>
            </div>
            <div class="mt-1.5 flex items-center gap-1.5 text-[10px]">
              <span class="tabular-nums" :class="card.dueTone">{{ card.due }}</span>
              <span class="ml-auto flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-white" :class="card.whoTone">
                {{ card.who }}
              </span>
            </div>
          </article>
          <article
            v-if="column.name === 'In progress' && cardMoved"
            class="motion-flash rounded-md border border-primary/40 bg-card px-2 py-1.5 shadow-elevated"
          >
            <div class="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Bug class="size-3 text-rose-500" />
              <span class="font-medium tabular-nums">DEMO-6</span>
            </div>
            <p class="line-clamp-2 text-[11px] leading-snug font-medium">Hero image loads slowly on phones</p>
            <div class="mt-1.5 flex items-center gap-1.5 text-[10px]">
              <span class="tabular-nums text-destructive">Moved just now</span>
              <span class="ml-auto flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">GY</span>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- Backlog -->
    <div v-else-if="view === 'backlog'" class="space-y-2 bg-muted/20 p-3">
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>Sprint backlog · 3 ready</span>
        <span class="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">10 points</span>
      </div>
      <ul class="space-y-1.5">
        <li
          v-for="item in BACKLOG"
          :key="item.key"
          class="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-sm"
        >
          <CircleDot class="size-3.5 text-sky-500" />
          <span class="text-xs text-muted-foreground tabular-nums">{{ item.key }}</span>
          <span class="min-w-0 flex-1 truncate font-medium">{{ item.title }}</span>
          <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">{{ item.priority }}</span>
          <span class="text-xs text-muted-foreground tabular-nums">{{ item.points }}</span>
        </li>
      </ul>
    </div>

    <!-- Tasks list -->
    <div v-else-if="view === 'tasks'" class="overflow-x-auto bg-muted/20 p-3">
      <table class="w-full min-w-[28rem] text-left text-xs">
        <thead class="text-[10px] tracking-wide text-muted-foreground uppercase">
          <tr>
            <th class="px-2 py-1.5 font-medium">Key</th>
            <th class="px-2 py-1.5 font-medium">Title</th>
            <th class="px-2 py-1.5 font-medium">Status</th>
            <th class="px-2 py-1.5 font-medium">Assignee</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in COLUMNS.flatMap((c) => c.cards.map((card) => ({ ...card, status: c.name }))).slice(0, 6)" :key="row.key" class="border-t border-border/50 bg-card/80">
            <td class="px-2 py-2 font-medium tabular-nums text-muted-foreground">{{ row.key }}</td>
            <td class="max-w-[14rem] truncate px-2 py-2 font-medium">{{ row.title }}</td>
            <td class="px-2 py-2">
              <span class="rounded-full bg-muted px-2 py-0.5">{{ row.status }}</span>
            </td>
            <td class="px-2 py-2">
              <span class="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">GY</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Roadmap -->
    <div v-else-if="view === 'roadmap'" class="space-y-3 bg-muted/20 p-3">
      <div class="grid grid-cols-5 gap-1 text-center text-[10px] text-muted-foreground">
        <span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span>
      </div>
      <div class="space-y-2">
        <div v-for="bar in ROADMAP" :key="bar.name" class="grid grid-cols-5 gap-1">
          <div :class="[bar.span, bar.tone, 'rounded-md px-2 py-2 text-[11px] font-semibold text-white shadow-sm']">
            {{ bar.name }}
          </div>
        </div>
      </div>
    </div>

    <!-- Calendar -->
    <div v-else-if="view === 'calendar'" class="bg-muted/20 p-3">
      <div class="mb-2 grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
        <span v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="d">{{ d }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <div
          v-for="day in 14"
          :key="day"
          class="min-h-14 rounded-md border border-border/50 bg-card p-1"
        >
          <span class="text-[10px] text-muted-foreground">{{ day + 16 }}</span>
          <span
            v-if="[3, 5, 8, 11].includes(day)"
            class="mt-1 block truncate rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-medium text-sky-700 dark:text-sky-300"
          >
            {{ day === 3 ? 'Design review' : day === 5 ? 'Launch sync' : day === 8 ? 'QA pass' : 'Go-live' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div v-else-if="view === 'messages'" class="grid grid-cols-[7.5rem_1fr] gap-0 bg-muted/20 sm:grid-cols-[9rem_1fr]">
      <aside class="space-y-1 border-r border-border/60 p-2">
        <p class="px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Channels</p>
        <button v-for="ch in ['#launch', '#design', '#eng']" :key="ch" type="button" class="block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium" :class="ch === '#launch' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'">
          {{ ch }}
        </button>
      </aside>
      <div class="space-y-2 p-3">
        <div class="flex gap-2">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-white">PR</span>
          <div class="rounded-lg rounded-tl-sm bg-muted/60 px-2.5 py-1.5 text-[11px]">Homepage mock is ready for review</div>
        </div>
        <div class="flex justify-end gap-2">
          <div class="rounded-lg rounded-tr-sm bg-primary px-2.5 py-1.5 text-[11px] text-primary-foreground">Looks great — ship after QA</div>
        </div>
        <div class="flex gap-2">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">AL</span>
          <div class="rounded-lg rounded-tl-sm bg-muted/60 px-2.5 py-1.5 text-[11px]">Updating DEMO-3 now</div>
        </div>
      </div>
    </div>

    <!-- Meetings -->
    <div v-else-if="view === 'meetings'" class="space-y-2 bg-muted/20 p-3">
      <div class="rounded-xl border border-border/70 bg-card p-3">
        <div class="flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600"><Rocket class="size-4" /></span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">Launch readiness sync</p>
            <p class="text-[11px] text-muted-foreground">Today · 10:00–10:30 · 4 invited</p>
          </div>
          <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Join</span>
        </div>
        <div class="mt-3 grid grid-cols-4 gap-1.5">
          <div v-for="who in ['GY', 'PR', 'AL', 'SK']" :key="who" class="flex aspect-video items-end justify-center rounded-md bg-linear-to-br from-slate-700 to-slate-900 pb-1">
            <span class="rounded bg-black/40 px-1 text-[9px] font-bold text-white">{{ who }}</span>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-muted-foreground">Action items from the call become board tasks automatically.</p>
    </div>

    <!-- Reports -->
    <div v-else class="space-y-3 bg-muted/20 p-3">
      <div class="grid grid-cols-3 gap-2">
        <div v-for="stat in [{ label: 'Done', value: '2' }, { label: 'In flight', value: '3' }, { label: 'Velocity', value: '+18%' }]" :key="stat.label" class="rounded-lg border border-border/70 bg-card px-3 py-2">
          <p class="text-[10px] text-muted-foreground">{{ stat.label }}</p>
          <p class="text-lg font-semibold tabular-nums">{{ stat.value }}</p>
        </div>
      </div>
      <div class="flex h-24 items-end gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2">
        <span v-for="(h, i) in [36, 48, 42, 58, 54, 70, 88]" :key="i" class="flex-1 rounded-t bg-linear-to-t from-sky-500/70 to-violet-400" :style="{ height: `${h}%` }" />
      </div>
    </div>
    </template>
  </div>
</template>
