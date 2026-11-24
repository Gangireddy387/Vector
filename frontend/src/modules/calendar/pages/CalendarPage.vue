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
import { CalendarCheck2, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock3, Grid3x3, ListTodo, Plus, Rows3, Square, UsersRound } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileSectionSelect from '@/components/common/MobileSectionSelect.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import StatCard from '@/components/common/StatCard.vue'
import Toolbar from '@/components/common/Toolbar.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useDevice } from '@/composables/useDevice'
import { useHotkeys } from '@/composables/useHotkeys'
import { toDateInput } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { structureApi } from '@/modules/departments/departments.api'
import { issuesApi } from '@/modules/issues/api/issues.api'
import type { Issue, Team } from '@/types/models'
import { type CalendarView, clockIn, durationMinutes, formatHours, hasStarted, isPastDay, toMinutes } from '../calendar-categories'
import { type CalendarEvent, calendarApi, type TeamEventKind } from '../calendar.api'
import DayAgenda from '../components/DayAgenda.vue'
import EventSheet, { type EventSheetTarget } from '../components/EventSheet.vue'
import MonthView from '../components/MonthView.vue'
import TimeGrid from '../components/TimeGrid.vue'
import WeekList from '../components/WeekList.vue'
import YearView from '../components/YearView.vue'

const route = useRoute()
const router = useRouter()
const { isDesktop, isWide } = useDevice()
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
type ScopeMode = 'me' | 'team'
const scope = ref<ScopeMode>(route.query.scope === 'team' || typeof route.query.team === 'string' ? 'team' : 'me')
const selected = ref(now.value.date)
const cursor = ref(parseISO(selected.value))
const sheetTarget = ref<EventSheetTarget | null>(null)

const TASK_LIMIT = 500
const events = ref<CalendarEvent[]>([])
const tasks = ref<Issue[]>([])
const tasksHiddenCount = ref(0)
const isLoading = ref(true)
const loadError = ref('')
const teams = ref<Team[]>([])
const teamId = ref<string | null>(typeof route.query.team === 'string' ? route.query.team : null)
const projectId = ref<string | null>(typeof route.query.project === 'string' ? route.query.project : null)
const teamProjects = ref<SelectFieldOption[]>([])
const showMeetings = useStorage('vector.calendar.team.meetings', true)
const showDue = useStorage('vector.calendar.team.due', true)
const showOther = useStorage('vector.calendar.team.other', true)
const isTeam = computed(() => scope.value === 'team')
const teamOptions = computed<SelectFieldOption[]>(() =>
  teams.value.map((team) => ({ value: team.id, label: team.name })),
)
const teamKinds = computed<TeamEventKind[]>(() => {
  const kinds: TeamEventKind[] = []
  if (showMeetings.value) kinds.push('meeting')
  if (showDue.value) kinds.push('due')
  if (showOther.value) kinds.push('other')
  return kinds.length ? kinds : ['meeting', 'due', 'other']
})

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
async function loadTeams() {
  try {
    const departments = await structureApi.list()
    teams.value = departments.flatMap((department) => department.teams ?? [])
    if (teamId.value && !teams.value.some((team) => team.id === teamId.value)) teamId.value = null
    if (!teamId.value && teams.value[0]) teamId.value = teams.value[0].id
  } catch {
    teams.value = []
  }
}

async function loadTeamProjects() {
  if (!teamId.value) {
    teamProjects.value = []
    projectId.value = null
    return
  }
  try {
    const work = await structureApi.teamWork(teamId.value)
    teamProjects.value = work.projects.map((project) => ({
      value: project.id,
      label: `${project.key} · ${project.name}`,
    }))
    if (projectId.value && !teamProjects.value.some((option) => option.value === projectId.value)) projectId.value = null
  } catch {
    teamProjects.value = []
  }
}

async function load() {
  const current = ++request
  isLoading.value = true
  loadError.value = ''
  try {
    if (isTeam.value) {
      if (!teamId.value) {
        events.value = []
        tasks.value = []
        tasksHiddenCount.value = 0
        return
      }
      const loadedEvents = await calendarApi.listTeam({
        teamId: teamId.value,
        from: from.value,
        to: to.value,
        projectId: projectId.value || undefined,
        kinds: teamKinds.value,
      })
      if (current !== request) return
      events.value = loadedEvents
      tasks.value = []
      tasksHiddenCount.value = 0
    } else {
      const [loadedEvents, loadedTasks] = await Promise.all([
        calendarApi.list(from.value, to.value),
        showTasks.value
          ? issuesApi.list({ assigneeId: 'me', dueFrom: from.value, dueTo: to.value, sort: 'dueDate', limit: TASK_LIMIT })
          : Promise.resolve({ issues: [] as Issue[], total: 0 }),
      ])
      if (current !== request) return
      events.value = loadedEvents
      tasks.value = loadedTasks.issues
      tasksHiddenCount.value = showTasks.value ? Math.max(0, loadedTasks.total - loadedTasks.issues.length) : 0
    }
  } catch (error) {
    if (current === request) {
      loadError.value = getErrorMessage(error)
      toast.error(loadError.value)
    }
  } finally {
    if (current === request) isLoading.value = false
  }
}

function syncScopeQuery() {
  const query = { ...route.query }
  if (isTeam.value) {
    query.scope = 'team'
    if (teamId.value) query.team = teamId.value
    else delete query.team
    if (projectId.value) query.project = projectId.value
    else delete query.project
    // Empty SelectField value means "all projects".
    if (query.project === '') delete query.project
  } else {
    delete query.scope
    delete query.team
    delete query.project
  }
  void router.replace({ query })
}

watch([from, to, showTasks, scope, teamId, projectId, showMeetings, showDue, showOther], load, { immediate: true })
watch(teamId, () => void loadTeamProjects())
watch(projectId, (value) => {
  if (value === '') projectId.value = null
})
watch([scope, teamId, projectId], syncScopeQuery)
onMounted(() => void loadTeams().then(() => loadTeamProjects()))

const sortKey = (event: CalendarEvent) => (event.allDay ? -1 : toMinutes(event.startTime ?? '00:00'))
const eventsByDay = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events.value) map.set(event.date, [...(map.get(event.date) ?? []), event])
  for (const list of map.values()) list.sort((a, b) => sortKey(a) - sortKey(b))
  return map
})
/** Tasks already mirrored as calendar events (issueId) stay out of the overlay so they are not shown twice. */
const syncedIssueIds = computed(() => new Set(events.value.map((event) => event.issueId).filter(Boolean)))
const tasksByDay = computed(() => {
  const map = new Map<string, Issue[]>()
  for (const task of tasks.value) {
    if (!task.dueDate || syncedIssueIds.value.has(task.id)) continue
    map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task])
  }
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
    people: new Set(planned.map((event) => event.ownerId).filter(Boolean)).size,
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
const onViewSelect = (value: string) => setView(value as CalendarView)
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
  if (isTeam.value) {
    toast.message('Team calendar is view-only', { description: 'Switch to Me to plan your own day.' })
    return
  }
  const date = isPastDay(requested, now.value) ? now.value.date : requested
  if (date !== requested) toast.info('Past days cannot be scheduled', { description: 'The new event starts today instead.' })
  selected.value = date
  const nextHour = Math.min(Number(now.value.time.slice(0, 2)) + 1, 23)
  const fallback = date === now.value.date && nextHour > 9 ? `${String(nextHour).padStart(2, '0')}:00` : '09:00'
  sheetTarget.value = { date, startTime: time && date === requested ? time : fallback }
}
const createForSelected = () => createOn(isPastDay(selected.value, now.value) ? now.value.date : selected.value)
const openTask = (key: string) => router.push({ query: { ...route.query, issue: key } })

function openEvent(event: CalendarEvent) {
  if (isTeam.value) {
    if (event.meetingId) {
      void router.push({ name: 'meeting-room', params: { meetingId: event.meetingId } })
      return
    }
    if (event.issueId) {
      const keyGuess = event.title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1]
      openTask(keyGuess ?? event.issueId)
      return
    }
    toast.message(event.title, {
      description: event.owner ? `${event.owner.name} · ${event.allDay ? 'All day' : event.startTime}` : 'Team events are view-only.',
    })
    return
  }
  sheetTarget.value = { event }
}

async function toggleDone(event: CalendarEvent) {
  if (isTeam.value) return
  const status = event.status === 'done' ? 'planned' : 'done'
  if (status === 'done' && !hasStarted(event, now.value)) {
    toast.info('This event has not started yet', { description: 'You can mark it done once it has started.' })
    return
  }
  const previous = event.status
  event.status = status
  try {
    const saved = await calendarApi.update(event.id, { status })
    events.value = events.value.map((item) => (item.id === saved.id ? { ...saved, owner: item.owner } : item))
    if (status === 'done') toast.success('Marked as done', { description: event.title })
  } catch (error) {
    event.status = previous
    toast.error(getErrorMessage(error))
  }
}

function setScope(next: ScopeMode) {
  scope.value = next
  if (next === 'team' && !teams.value.length) void loadTeams().then(() => loadTeamProjects())
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
  <!-- fillHeight shell clips main; this page owns scroll. Pad matches topbar so edges line up. -->
  <PageFrame
    mode="bare"
    gap="none"
    pad="none"
    class="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-5 sm:gap-4 sm:px-3 sm:pt-4 sm:pb-6 lg:px-4"
  >
    <PageHeader
      title="Calendar"
      :description="
        isTeam
          ? 'Shared view of your team’s meetings, due dates and work blocks. Personal events stay private.'
          : 'Plan each day, tick off what you finished and see how your time was spent. Only you see your events.'
      "
    >
      <template #actions>
        <Button v-if="!isTeam" variant="brand" class="max-sm:w-full" title="New event (N)" @click="createForSelected"><Plus /> New event</Button>
      </template>
    </PageHeader>

    <p
      v-if="!isTeam && showTasks && tasksHiddenCount"
      class="shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning"
      role="status"
    >
      Showing the first {{ TASK_LIMIT }} of {{ TASK_LIMIT + tasksHiddenCount }} tasks due in this range for speed;
      {{ tasksHiddenCount }} more are in
      <RouterLink :to="{ name: 'issues', query: { assigneeId: 'me' } }" class="font-medium underline-offset-2 hover:underline">My tasks</RouterLink>.
    </p>

    <div class="grid shrink-0 grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
      <StatCard variant="card" label="Events" :value="stats.planned" :icon="CalendarDays" :hint="periodLabel" />
      <StatCard variant="card" label="Completed" :value="`${stats.percent}%`" :icon="CalendarCheck2" tone="success" :hint="`${stats.done} of ${stats.planned} done`">
        <Progress :model-value="stats.percent" class="mt-2 h-1.5" indicator-class="bg-success" />
      </StatCard>
      <StatCard variant="card" label="Time scheduled" :value="formatHours(stats.minutes)" :icon="Clock3" tone="warning" :hint="periodLabel" />
      <StatCard
        variant="card"
        :label="isTeam ? 'People on events' : 'Your tasks due'"
        :value="isTeam ? stats.people : showTasks ? stats.tasks : '–'"
        :icon="isTeam ? UsersRound : ListTodo"
        tone="info"
        :hint="isTeam ? 'With work this period' : showTasks ? `${stats.tasksDone} done` : 'Tasks are hidden'"
      />
    </div>

    <!--
      Stacked (<xl): fixed month height + natural agenda height so page scroll never clips mid-text.
      Side-by-side (xl+): both panes fill leftover viewport height.
    -->
    <div class="grid w-full grid-rows-[auto_auto] gap-3 sm:gap-3.5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:grid-rows-1 xl:gap-4">
      <section class="relative flex h-[min(26rem,48dvh)] min-h-[18rem] min-w-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft sm:h-[min(30rem,52dvh)] xl:h-full xl:min-h-0">
        <div v-if="isLoading" class="loading-shimmer-bar absolute inset-x-0 top-0 z-30" aria-hidden="true" />
        <div
          v-if="isLoading && !events.length"
          class="absolute inset-0 z-20 flex flex-col gap-3 bg-card/80 p-3 backdrop-blur-[1px] sm:p-4"
          aria-busy="true"
          aria-label="Loading calendar"
        >
          <div class="flex items-center gap-2">
            <Skeleton class="h-8 w-24 rounded-md" />
            <Skeleton class="h-8 w-16 rounded-md" />
            <Skeleton class="h-8 w-40 rounded-md" />
            <Skeleton class="ml-auto h-8 w-36 rounded-md" />
          </div>
          <div class="grid min-h-0 flex-1 grid-cols-7 gap-1">
            <Skeleton v-for="index in 7" :key="`h-${index}`" class="h-6 w-full rounded-sm" />
            <Skeleton v-for="index in 35" :key="`c-${index}`" class="min-h-[3.25rem] w-full rounded-md sm:min-h-[4rem]" />
          </div>
        </div>

        <EmptyState
          v-if="loadError && !events.length && !isLoading"
          title="Couldn’t load the calendar"
          :description="loadError"
          class="absolute inset-0 z-20 bg-card py-12"
        >
          <Button variant="outline" @click="load">Try again</Button>
        </EmptyState>

        <div class="shrink-0 space-y-2 border-b border-border px-3 py-2">
          <Toolbar variant="wrap" dense justify="between" class="w-full">
            <template #start>
              <SegmentedControl
                :model-value="isTeam ? 'team' : 'me'"
                aria-label="Calendar scope"
                :options="[
                  { value: 'me', label: 'Me' },
                  { value: 'team', label: 'Team', icon: UsersRound },
                ]"
                @update:model-value="(value) => setScope(value === 'team' ? 'team' : 'me')"
              />
              <Button variant="outline" size="sm" title="Today (T)" @click="goToday">Today</Button>
              <div class="flex items-center">
                <Button variant="ghost" size="icon-sm" :aria-label="`Previous ${stepLabel}`" :title="`Previous ${stepLabel} (←)`" @click="shift(-1)"><ChevronLeft /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`Next ${stepLabel}`" :title="`Next ${stepLabel} (→)`" @click="shift(1)"><ChevronRight /></Button>
              </div>
              <h2 class="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight" aria-live="polite">{{ heading }}</h2>
            </template>
            <template #end>
              <label v-if="!isTeam" class="flex h-7 items-center gap-2 text-xs text-muted-foreground">
                <Switch v-model="showTasks" aria-label="Show my tasks due" /> My tasks
              </label>
              <MobileSectionSelect
                v-if="!isWide"
                :model-value="view"
                :options="VIEWS"
                aria-label="Calendar view"
                @update:model-value="onViewSelect"
              />
              <SegmentedControl
                v-else
                :model-value="view"
                class="flex-wrap"
                aria-label="Calendar view"
                :options="VIEWS.map((option) => ({ value: option.value, label: option.label, icon: option.icon, labelClass: 'hidden sm:inline' }))"
                @update:model-value="(value) => setView(value as CalendarView)"
              />
            </template>
          </Toolbar>

          <div
            v-if="isTeam"
            class="flex flex-wrap items-center gap-x-2 gap-y-1.5"
            role="group"
            aria-label="Team calendar filters"
          >
            <SelectField
              v-model="teamId"
              :options="teamOptions"
              placeholder="Choose team…"
              size="sm"
              class="w-40 shrink-0"
              aria-label="Team"
            />
            <SelectField
              v-if="teamProjects.length"
              v-model="projectId"
              :options="[{ value: '', label: 'All projects' }, ...teamProjects]"
              placeholder="All projects"
              size="sm"
              class="w-44 shrink-0"
              aria-label="Project filter"
            />
            <label class="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
              <Switch v-model="showMeetings" /> Meetings
            </label>
            <label class="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
              <Switch v-model="showDue" /> Due dates
            </label>
            <label class="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
              <Switch v-model="showOther" /> Other
            </label>
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
        class="w-full xl:h-full xl:min-h-0 xl:overflow-hidden"
        :date="selected"
        :events="eventsByDay.get(selected) ?? []"
        :tasks="tasksByDay.get(selected) ?? []"
        :now="now"
        :read-only="isTeam"
        :tasks-label="isTeam ? 'Tasks due' : 'Your tasks due'"
        @create="createOn(selected)"
        @open="openEvent"
        @toggle="toggleDone"
        @open-task="openTask"
      />
    </div>

    <EventSheet v-if="!isTeam" v-model:target="sheetTarget" @changed="load" />
  </PageFrame>
</template>
