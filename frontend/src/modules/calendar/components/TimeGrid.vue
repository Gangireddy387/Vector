<script setup lang="ts">
import { format } from 'date-fns'
import { Check, ListTodo } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { toDateInput } from '@/lib/format'
import type { Issue } from '@/types/models'
import { type Clock, categoryInfo, eventTint, timeLabel, toMinutes } from '../calendar-categories'
import type { CalendarEvent } from '../calendar.api'

/** Hour-by-hour timeline for one day (day view) or seven (week view). */
const props = defineProps<{
  days: Date[]
  selected: string
  now: Clock
  eventsByDay: Map<string, CalendarEvent[]>
  tasksByDay: Map<string, Issue[]>
}>()
const emit = defineEmits<{
  create: [date: string, time: string]
  open: [event: CalendarEvent]
  openTask: [key: string]
  openDay: [date: string]
}>()

const HOUR_PX = 48
const SLOT_MINUTES = 30
const SLOTS = (24 * 60) / SLOT_MINUTES
/** Short events are drawn at least this tall so their title and type stay readable. */
const MIN_EVENT_MINUTES = 30

const pad = (value: number) => String(value).padStart(2, '0')
const slotTime = (index: number) => `${pad(Math.floor((index * SLOT_MINUTES) / 60))}:${pad((index * SLOT_MINUTES) % 60)}`
const px = (minutes: number) => `${(minutes * HOUR_PX) / 60}px`

interface Placed {
  event: CalendarEvent
  start: number
  end: number
  column: number
  columns: number
}

/** Overlapping events share the width side by side, the way most calendars lay them out. */
function layout(events: CalendarEvent[]) {
  const items: Placed[] = events
    .map((event) => {
      const start = toMinutes(event.startTime!)
      const end = Math.max(event.endTime ? toMinutes(event.endTime) : start + SLOT_MINUTES, start + MIN_EVENT_MINUTES)
      return { event, start, end, column: 0, columns: 1 }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  let cluster: Placed[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    const columns = Math.max(...cluster.map((item) => item.column)) + 1
    cluster.forEach((item) => (item.columns = columns))
    cluster = []
    clusterEnd = -1
  }
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) closeCluster()
    const taken = new Set(cluster.filter((other) => other.end > item.start).map((other) => other.column))
    while (taken.has(item.column)) item.column += 1
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  if (cluster.length) closeCluster()
  return items
}

const columns = computed(() =>
  props.days.map((day) => {
    const date = toDateInput(day)
    const events = props.eventsByDay.get(date) ?? []
    return {
      day,
      date,
      isPast: date < props.now.date,
      isToday: date === props.now.date,
      allDay: events.filter((event) => event.allDay),
      timed: layout(events.filter((event) => !event.allDay && event.startTime)),
      tasks: props.tasksByDay.get(date) ?? [],
    }
  }),
)
const nowMinutes = computed(() => toMinutes(props.now.time))
const gridColumns = computed(() => ({ gridTemplateColumns: `3.5rem repeat(${props.days.length}, minmax(0, 1fr))` }))
const isSlotPast = (column: { isPast: boolean; isToday: boolean }, index: number) =>
  column.isPast || (column.isToday && (index + 1) * SLOT_MINUTES <= nowMinutes.value)

/** Opens on the working day, or just before the current time when today is on screen. */
const scroller = ref<HTMLElement | null>(null)
async function scrollToStart() {
  await nextTick()
  const hasToday = columns.value.some((column) => column.isToday)
  const hour = hasToday ? Math.max(0, Math.floor(nowMinutes.value / 60) - 2) : 7
  scroller.value?.scrollTo({ top: hour * HOUR_PX })
}
onMounted(scrollToStart)
watch(() => props.days[0]?.getTime(), scrollToStart)
</script>

<template>
  <div class="flex flex-col">
    <div v-if="days.length > 1" class="grid shrink-0 border-b border-border/70" :style="gridColumns">
      <span />
      <button
        v-for="column in columns"
        :key="column.date"
        type="button"
        class="flex flex-col items-center gap-0.5 border-l border-border/60 py-2 transition-colors hover:bg-muted/40"
        :class="column.date === selected && 'bg-primary/5'"
        :title="`Open ${format(column.day, 'EEEE d MMMM')}`"
        @click="emit('openDay', column.date)"
      >
        <span class="text-[11px] font-semibold tracking-wider uppercase" :class="column.isToday ? 'text-brand' : 'text-muted-foreground'">{{ format(column.day, 'EEE') }}</span>
        <span
          class="flex size-8 items-center justify-center text-base font-semibold tabular-nums"
          :class="column.isToday ? 'bg-brand text-white' : column.isPast ? 'text-muted-foreground' : ''"
        >
          {{ format(column.day, 'd') }}
        </span>
      </button>
    </div>

    <div class="grid max-h-28 shrink-0 overflow-y-auto border-b border-border/70 bg-muted/20 scrollbar-thin" :style="gridColumns">
      <span class="px-2 py-2 text-right text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">All day</span>
      <div v-for="column in columns" :key="column.date" class="min-h-10 space-y-0.5 border-l border-border/60 p-1">
        <button
          v-for="event in column.allDay"
          :key="event.id"
          type="button"
          class="flex w-full items-center gap-1 truncate border-l-2 px-1.5 py-1 text-left text-[11px] font-medium transition-colors hover:brightness-95"
          :class="[event.status !== 'planned' && 'text-muted-foreground line-through', event.status === 'cancelled' && 'opacity-60']"
          :style="eventTint(event.category)"
          :title="`${event.title} · ${categoryInfo(event.category).label}`"
          @click="emit('open', event)"
        >
          <Check v-if="event.status === 'done'" class="size-3 shrink-0 text-success" />
          <component :is="categoryInfo(event.category).icon" v-else class="size-3 shrink-0" :style="{ color: categoryInfo(event.category).color }" />
          <span class="truncate">{{ event.title }}</span>
        </button>
        <button
          v-for="task in column.tasks"
          :key="task.id"
          type="button"
          class="flex w-full items-center gap-1 truncate border border-dashed border-border px-1.5 py-1 text-left text-[11px] hover:border-primary/40"
          :class="task.status.category === 'done' && 'text-muted-foreground line-through'"
          :title="`${task.key} ${task.title}`"
          @click="emit('openTask', task.key)"
        >
          <ListTodo class="size-3 shrink-0 text-muted-foreground" /> <span class="truncate">{{ task.title }}</span>
        </button>
      </div>
    </div>

    <div ref="scroller" class="max-h-[40rem] min-h-0 flex-1 overflow-y-auto scrollbar-thin xl:max-h-none">
      <div class="grid" :style="gridColumns">
        <div class="relative" :style="{ height: px(24 * 60) }" aria-hidden="true">
          <span
            v-for="hour in 23"
            :key="hour"
            class="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
            :style="{ top: px(hour * 60) }"
          >
            {{ pad(hour) }}:00
          </span>
        </div>

        <div
          v-for="column in columns"
          :key="column.date"
          class="relative border-l border-border/60"
          :class="column.date === selected && days.length > 1 && 'bg-primary/[0.03]'"
          :style="{ height: px(24 * 60) }"
        >
          <button
            v-for="index in SLOTS"
            :key="index"
            type="button"
            tabindex="-1"
            class="block w-full border-b transition-colors"
            :class="[
              index % 2 ? 'border-dashed border-border/35' : 'border-border/60',
              isSlotPast(column, index - 1) ? 'cursor-default' : 'hover:bg-primary/5',
            ]"
            :style="{ height: px(SLOT_MINUTES) }"
            :disabled="isSlotPast(column, index - 1)"
            :aria-label="`Add an event on ${format(column.day, 'd MMMM')} at ${slotTime(index - 1)}`"
            @click="emit('create', column.date, slotTime(index - 1))"
          />

          <div v-if="column.isPast" class="pointer-events-none absolute inset-0 bg-muted/35" />
          <div v-else-if="column.isToday" class="pointer-events-none absolute inset-x-0 top-0 bg-muted/35" :style="{ height: px(nowMinutes) }" />

          <button
            v-for="item in column.timed"
            :key="item.event.id"
            type="button"
            class="absolute z-10 flex flex-col overflow-hidden border-l-[3px] px-1.5 text-left text-[11px] leading-tight shadow-xs ring-1 ring-card transition-[filter] hover:brightness-95"
            :class="[
              item.end - item.start < 40 ? 'justify-center py-0.5' : 'py-1',
              item.event.status === 'cancelled' && 'opacity-55',
              item.event.status === 'done' && 'opacity-80',
            ]"
            :style="{
              ...eventTint(item.event.category),
              top: px(item.start),
              height: px(item.end - item.start),
              left: `${(item.column / item.columns) * 100}%`,
              width: `${100 / item.columns}%`,
            }"
            :title="`${timeLabel(item.event)} · ${item.event.title} · ${categoryInfo(item.event.category).label}`"
            @click="emit('open', item.event)"
          >
            <span class="flex min-w-0 items-center gap-1">
              <Check v-if="item.event.status === 'done'" class="size-3 shrink-0 text-success" />
              <component :is="categoryInfo(item.event.category).icon" v-else class="size-3 shrink-0" :style="{ color: categoryInfo(item.event.category).color }" />
              <span class="truncate font-semibold" :class="item.event.status !== 'planned' && 'line-through'">{{ item.event.title }}</span>
              <span v-if="item.end - item.start < 40" class="shrink-0 truncate text-muted-foreground tabular-nums">
                · {{ item.event.startTime }} · {{ categoryInfo(item.event.category).label }}
              </span>
            </span>
            <span v-if="item.end - item.start >= 40" class="truncate text-muted-foreground tabular-nums">
              {{ timeLabel(item.event) }} · {{ categoryInfo(item.event.category).label }}
            </span>
            <span v-if="item.end - item.start >= 70 && item.event.location" class="truncate text-muted-foreground">{{ item.event.location }}</span>
          </button>

          <div v-if="column.isToday" class="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500" :style="{ top: px(nowMinutes) }">
            <span class="absolute -top-[3px] -left-1 size-2 rounded-full bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
