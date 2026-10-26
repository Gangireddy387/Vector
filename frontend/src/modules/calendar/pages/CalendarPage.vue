<script setup lang="ts">
import { useIntervalFn, useNow, useStorage } from '@vueuse/core'
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfYear,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { CalendarCheck2, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock3, Grid3x3, ListTodo, Plus, Rows3, Square } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { useDevice } from '@/composables/useDevice'
import { useHotkeys } from '@/composables/useHotkeys'
import { toDateInput } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { issuesApi } from '@/modules/issues/api/issues.api'
import type { Issue } from '@/types/models'
import { type CalendarView, clockIn, durationMinutes, formatHours, hasStarted, isPastDay, toMinutes } from '../calendar-categories'
import { type CalendarEvent, calendarApi } from '../calendar.api'
import DayAgenda from '../components/DayAgenda.vue'
import EventSheet, { type EventSheetTarget } from '../components/EventSheet.vue'
import MonthView from '../components/MonthView.vue'
import TimeGrid from '../components/TimeGrid.vue'
import WeekList from '../components/WeekList.vue'
import YearView from '../components/YearView.vue'

const route = useRoute()
const router = useRouter()
const { isDesktop } = useDevice()
const auth = useAuthStore()
const tick = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })
const now = computed(() => clockIn(auth.user?.timezone, tick.value))

const VIEWS: Array<{ value: CalendarView; label: string; key: string; icon: typeof Square }> = [
  { value: 'day', label: 'Day', key: 'D', icon: Square },
  { value: 'week', label: 'Week', key: 'W', icon: Rows3 },
  { value: 'month', label: 'Month', key: 'M', icon: CalendarRange },
  { value: 'year', label: 'Year', key: 'Y', icon: Grid3x3 },
]
const storedView = useStorage<CalendarView>('vector.calendar.view', 'month')
const view = computed<CalendarView>({
  get: () => (VIEWS.some((option) => option.value === storedView.value) ? storedView.value : 'month'),
  set: (value) => (storedView.value = value),
})
const showTasks = useStorage('vector.calendar.tasks', true)
const selected = ref(now.value.date)
const cursor = ref(parseISO(selected.value))
const sheetTarget = ref<EventSheetTarget | null>(null)

const events = ref<CalendarEvent[]>([])
const tasks = ref<Issue[]>([])
const isLoading = ref(true)

const days = computed(() => {
  switch (view.value) {
    case 'day':
      return [parseISO(selected.value)]
    case 'week': {
      const first = startOfWeek(cursor.value, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, index) => addDays(first, index))
    }
    case 'month': {
      const first = startOfWeek(startOfMonth(cursor.value), { weekStartsOn: 1 })
      return Array.from({ length: 42 }, (_, index) => addDays(first, index))
    }
    default:
      return eachDayOfInterval({ start: startOfYear(cursor.value), end: endOfYear(cursor.value) })
  }
})
const from = computed(() => toDateInput(days.value[0]!))
const to = computed(() => toDateInput(days.value.at(-1)!))

const heading = computed(() => {
  const first = days.value[0]!
  const last = days.value.at(-1)!
  switch (view.value) {
    case 'day':
      return format(first, 'EEEE, d MMMM yyyy')
    case 'week':
      return isSameMonth(first, last) ? `${format(first, 'd')} – ${format(last, 'd MMMM yyyy')}` : `${format(first, 'd MMM')} – ${format(last, 'd MMM yyyy')}`
    case 'month':
      return format(cursor.value, 'MMMM yyyy')
    default:
      return format(cursor.value, 'yyyy')
  }
})

let request = 0
async function load() {
  const current = ++request
  isLoading.value = true
  try {
    const [loadedEvents, loadedTasks] = await Promise.all([
      calendarApi.list(from.value, to.value),
      showTasks.value
        ? issuesApi.list({ assigneeId: 'me', dueFrom: from.value, dueTo: to.value, sort: 'dueDate', limit: 500 }).then((result) => result.issues)
        : Promise.resolve([]),
    ])
    if (current !== request) return
    events.value = loadedEvents
    tasks.value = loadedTasks
  } catch (error) {
    if (current === request) toast.error(getErrorMessage(error))
  } finally {
    if (current === request) isLoading.value = false
  }
}
watch([from, to, showTasks], load, { immediate: true })

const sortKey = (event: CalendarEvent) => (event.allDay ? -1 : toMinutes(event.startTime ?? '00:00'))
const eventsByDay = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events.value) map.set(event.date, [...(map.get(event.date) ?? []), event])
  for (const list of map.values()) list.sort((a, b) => sortKey(a) - sortKey(b))
  return map
})
const tasksByDay = computed(() => {
  const map = new Map<string, Issue[]>()
  for (const task of tasks.value) if (task.dueDate) map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task])
  return map
})

/** The days the numbers describe: the month grid's neighbouring days are left out. */
const periodDates = computed(() => {
  const list = view.value === 'month' ? days.value.filter((day) => isSameMonth(day, cursor.value)) : days.value
  return new Set(list.map(toDateInput))
})
const stats = computed(() => {
  const planned = events.value.filter((event) => periodDates.value.has(event.date) && event.status !== 'cancelled')
  const done = planned.filter((event) => event.status === 'done').length
  const periodTasks = tasks.value.filter((task) => task.dueDate && periodDates.value.has(task.dueDate))
  return {
    planned: planned.length,
    done,
    percent: planned.length ? Math.round((done / planned.length) * 100) : 0,
    minutes: planned.reduce((total, event) => total + durationMinutes(event), 0),
    tasks: periodTasks.length,
    tasksDone: periodTasks.filter((task) => task.status.category === 'done').length,
  }
})
const periodLabel = computed(() => {
  const includesToday = periodDates.value.has(now.value.date)
  switch (view.value) {
    case 'day':
      return includesToday ? 'Today' : format(days.value[0]!, 'd MMM')
    case 'week':
      return includesToday ? 'This week' : `Week of ${format(days.value[0]!, 'd MMM')}`
    case 'month':
      return format(cursor.value, 'MMMM')
    default:
      return format(cursor.value, 'yyyy')
  }
})

const STEP = { day: addDays, week: addWeeks, month: addMonths, year: addYears } satisfies Record<CalendarView, (date: Date, amount: number) => Date>
const periodStart = (date: Date) =>
  ({ day: date, week: startOfWeek(date, { weekStartsOn: 1 }), month: startOfMonth(date), year: startOfYear(date) })[view.value]
const stepLabel = computed(() => VIEWS.find((option) => option.value === view.value)!.label.toLowerCase())

/** Moves a whole period; the selected day moves along when it was inside the period on screen. */
function shift(step: number) {
  const add = STEP[view.value]
  const wasInPeriod = periodDates.value.has(selected.value)
  cursor.value = add(cursor.value, step)
  selected.value = toDateInput(wasInPeriod ? add(parseISO(selected.value), step) : periodStart(cursor.value))
  if (view.value === 'day') cursor.value = parseISO(selected.value)
}
function goToday() {
  selected.value = now.value.date
  cursor.value = parseISO(now.value.date)
}
function setView(next: CalendarView) {
  cursor.value = parseISO(selected.value)
  view.value = next
}
function openDay(date: string) {
  selected.value = date
  setView('day')
}
function openMonth(firstOfMonth: string) {
  const month = firstOfMonth.slice(0, 7)
  if (selected.value.slice(0, 7) !== month) selected.value = now.value.date.slice(0, 7) === month ? now.value.date : firstOfMonth
  setView('month')
}

/** New events start at the clicked slot, the next full hour today, or 09:00. Past days cannot be scheduled, so those start today. */
function createOn(requested: string, time?: string) {
  const date = isPastDay(requested, now.value) ? now.value.date : requested
  if (date !== requested) toast.info('Past days cannot be scheduled', { description: 'The new event starts today instead.' })
  selected.value = date
  const nextHour = Math.min(Number(now.value.time.slice(0, 2)) + 1, 23)
  const fallback = date === now.value.date && nextHour > 9 ? `${String(nextHour).padStart(2, '0')}:00` : '09:00'
  sheetTarget.value = { date, startTime: time && date === requested ? time : fallback }
}
const createForSelected = () => createOn(isPastDay(selected.value, now.value) ? now.value.date : selected.value)
const openEvent = (event: CalendarEvent) => (sheetTarget.value = { event })
const openTask = (key: string) => router.push({ query: { ...route.query, issue: key } })

async function toggleDone(event: CalendarEvent) {
  const status = event.status === 'done' ? 'planned' : 'done'
  if (status === 'done' && !hasStarted(event, now.value)) {
    toast.info('This event has not started yet', { description: 'You can mark it done once it has started.' })
    return
  }
  const previous = event.status
  event.status = status
  try {
    const saved = await calendarApi.update(event.id, { status })
    events.value = events.value.map((item) => (item.id === saved.id ? saved : item))
    if (status === 'done') toast.success('Marked as done', { description: event.title })
  } catch (error) {
    event.status = previous
    toast.error(getErrorMessage(error))
  }
}

useHotkeys({
  d: () => setView('day'),
  w: () => setView('week'),
  m: () => setView('month'),
  y: () => setView('year'),
  t: goToday,
  n: createForSelected,
  arrowleft: () => shift(-1),
  arrowright: () => shift(1),
})
</script>

<template>
  <!-- On wide screens the page fits the window: the calendar takes the remaining height instead of the page scrolling. -->
  <div class="w-full space-y-5 xl:flex xl:h-full xl:flex-col xl:space-y-4" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader title="Calendar" description="Plan each day, tick off what you finished and see how your time was spent. Only you see your events.">
      <template #eyebrow>
        <span class="text-brand text-xs font-semibold tracking-wider uppercase">Your schedule</span>
      </template>
      <template #actions>
        <Button variant="brand" title="New event (N)" @click="createForSelected"><Plus /> New event</Button>
      </template>
    </PageHeader>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="flex items-center gap-3 border border-border/70 bg-card p-4 shadow-soft">
        <span class="flex size-10 items-center justify-center bg-primary/10 text-primary"><CalendarDays class="size-5" /></span>
        <span class="min-w-0">
          <span class="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{{ stats.planned }}</span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">Events · {{ periodLabel }}</span>
        </span>
      </div>
      <div class="flex flex-col justify-center gap-2 border border-border/70 bg-card p-4 shadow-soft">
        <div class="flex items-center gap-3">
          <span class="flex size-10 items-center justify-center bg-success/15 text-success"><CalendarCheck2 class="size-5" /></span>
          <span class="min-w-0">
            <span class="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{{ stats.percent }}%</span>
            <span class="mt-1 block truncate text-xs text-muted-foreground">{{ stats.done }} of {{ stats.planned }} done</span>
          </span>
        </div>
        <Progress :model-value="stats.percent" class="h-1.5" indicator-class="bg-success" />
      </div>
      <div class="flex items-center gap-3 border border-border/70 bg-card p-4 shadow-soft">
        <span class="flex size-10 items-center justify-center bg-amber-500/15 text-amber-600"><Clock3 class="size-5" /></span>
        <span class="min-w-0">
          <span class="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{{ formatHours(stats.minutes) }}</span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">Time scheduled · {{ periodLabel }}</span>
        </span>
      </div>
      <div class="flex items-center gap-3 border border-border/70 bg-card p-4 shadow-soft">
        <span class="flex size-10 items-center justify-center bg-violet-500/15 text-violet-600"><ListTodo class="size-5" /></span>
        <span class="min-w-0">
          <span class="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{{ showTasks ? stats.tasks : '–' }}</span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">{{ showTasks ? `Your tasks due · ${stats.tasksDone} done` : 'Tasks are hidden' }}</span>
        </span>
      </div>
    </div>

    <div class="grid gap-5 xl:min-h-[30rem] xl:flex-1 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-4">
      <section class="relative flex min-w-0 flex-col overflow-hidden border border-border/80 bg-card shadow-soft xl:min-h-0">
        <div v-if="isLoading" class="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-brand" aria-hidden="true" />

        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <Button variant="outline" size="sm" title="Today (T)" @click="goToday">Today</Button>
          <div class="flex">
            <Button variant="ghost" size="icon-sm" :aria-label="`Previous ${stepLabel}`" :title="`Previous ${stepLabel} (←)`" @click="shift(-1)"><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" :aria-label="`Next ${stepLabel}`" :title="`Next ${stepLabel} (→)`" @click="shift(1)"><ChevronRight /></Button>
          </div>
          <h2 class="mr-auto min-w-0 truncate text-base font-semibold tracking-tight" aria-live="polite">{{ heading }}</h2>

          <label class="flex items-center gap-2 text-xs text-muted-foreground"><Switch v-model="showTasks" aria-label="Show my tasks due" /> My tasks</label>
          <div class="flex w-full border border-border/80 bg-muted/40 p-0.5 sm:w-auto" role="tablist" aria-label="Calendar view">
            <button
              v-for="option in VIEWS"
              :key="option.value"
              type="button"
              role="tab"
              class="flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all sm:flex-none"
              :class="view === option.value ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="view === option.value"
              :title="`${option.label} view (${option.key})`"
              @click="setView(option.value)"
            >
              <component :is="option.icon" class="size-3.5" />
              {{ option.label }}
            </button>
          </div>
        </div>

        <TimeGrid
          v-if="view === 'day' || (view === 'week' && isDesktop)"
          class="min-h-0 flex-1"
          :days="days"
          :selected="selected"
          :now="now"
          :events-by-day="eventsByDay"
          :tasks-by-day="tasksByDay"
          @create="createOn"
          @open="openEvent"
          @open-task="openTask"
          @open-day="openDay"
        />
        <WeekList
          v-else-if="view === 'week'"
          class="min-h-0 flex-1 overflow-y-auto"
          :days="days"
          :selected="selected"
          :now="now"
          :events-by-day="eventsByDay"
          :tasks-by-day="tasksByDay"
          @create="createOn"
          @open="openEvent"
          @open-task="openTask"
          @open-day="openDay"
        />
        <MonthView
          v-else-if="view === 'month'"
          class="min-h-0 flex-1"
          :cursor="cursor"
          :days="days"
          :selected="selected"
          :now="now"
          :events-by-day="eventsByDay"
          :tasks-by-day="tasksByDay"
          @select="selected = $event"
          @create="createOn"
          @open="openEvent"
          @open-task="openTask"
          @open-day="openDay"
        />
        <YearView
          v-else
          class="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
          :year="cursor.getFullYear()"
          :selected="selected"
          :now="now"
          :events-by-day="eventsByDay"
          :tasks-by-day="tasksByDay"
          @select="selected = $event"
          @open-month="openMonth"
        />
      </section>

      <DayAgenda
        :date="selected"
        :events="eventsByDay.get(selected) ?? []"
        :tasks="tasksByDay.get(selected) ?? []"
        :now="now"
        @create="createOn(selected)"
        @open="openEvent"
        @toggle="toggleDone"
        @open-task="openTask"
      />
    </div>

    <EventSheet v-model:target="sheetTarget" @changed="load" />
  </div>
</template>
