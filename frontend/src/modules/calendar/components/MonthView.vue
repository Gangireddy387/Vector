<script setup lang="ts">
import { format, isSameMonth, isWeekend } from 'date-fns'
import { useElementSize } from '@vueuse/core'
import { ListTodo, Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toDateInput } from '@/lib/format'
import type { Issue } from '@/types/models'
import { type Clock, categoryInfo, eventTint } from '../calendar-categories'
import type { CalendarEvent } from '../calendar.api'

const props = defineProps<{
  cursor: Date
  days: Date[]
  selected: string
  now: Clock
  eventsByDay: Map<string, CalendarEvent[]>
  tasksByDay: Map<string, Issue[]>
}>()
const emit = defineEmits<{ select: [date: string]; create: [date: string]; open: [event: CalendarEvent]; openTask: [key: string]; openDay: [date: string] }>()

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NUMBER_PX = 30
const CHIP_PX = 19
const MORE_PX = 16

/** The six weeks share the height on screen, so each day shows as many items as fit and "+N more" for the rest. */
const grid = ref<HTMLElement | null>(null)
const { height } = useElementSize(grid)
const maxInCell = computed(() => {
  const rowHeight = height.value / 6
  if (!rowHeight) return 3
  return Math.max(1, Math.min(5, Math.floor((rowHeight - DAY_NUMBER_PX - MORE_PX) / CHIP_PX)))
})
const visibleCount = (day: Date) => {
  const total = eventsOn(day).length + tasksOn(day).length
  return total > maxInCell.value ? maxInCell.value : total
}

const eventsOn = (day: Date) => props.eventsByDay.get(toDateInput(day)) ?? []
const tasksOn = (day: Date) => props.tasksByDay.get(toDateInput(day)) ?? []
const isPast = (day: Date) => toDateInput(day) < props.now.date
const isToday = (day: Date) => toDateInput(day) === props.now.date
</script>

<template>
  <div class="flex flex-col">
    <div class="grid shrink-0 grid-cols-7 border-b border-border/70 bg-muted/30 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-2">{{ weekday }}</span>
    </div>
    <div ref="grid" class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
      <div
        v-for="day in days"
        :key="day.toISOString()"
        class="group relative flex min-h-16 cursor-pointer flex-col gap-1 overflow-hidden border-r border-b border-border/60 p-1.5 transition-colors outline-none nth-[7n]:border-r-0 nth-last-[-n+7]:border-b-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset sm:min-h-28 xl:min-h-0"
        :class="[
          !isSameMonth(day, cursor) && 'bg-muted/20 text-muted-foreground/60',
          isWeekend(day) && isSameMonth(day, cursor) && 'bg-muted/10',
          toDateInput(day) === selected && 'bg-primary/5 ring-2 ring-primary/40 ring-inset',
        ]"
        role="button"
        tabindex="0"
        :aria-label="`${format(day, 'EEEE d MMMM')}: ${eventsOn(day).length} events`"
        :aria-pressed="toDateInput(day) === selected"
        @click="emit('select', toDateInput(day))"
        @dblclick="!isPast(day) && emit('create', toDateInput(day))"
        @keydown.enter="emit('select', toDateInput(day))"
      >
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="flex size-6 items-center justify-center text-xs font-medium tabular-nums transition-colors hover:bg-accent"
            :class="isToday(day) ? 'bg-brand font-semibold text-white hover:bg-brand' : isPast(day) ? 'text-muted-foreground/70' : ''"
            :title="`Open ${format(day, 'EEEE d MMMM')}`"
            @click.stop="emit('openDay', toDateInput(day))"
          >
            {{ format(day, 'd') }}
          </button>
          <button
            v-if="!isPast(day)"
            type="button"
            class="hidden size-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 sm:flex"
            :aria-label="`Add an event on ${format(day, 'd MMMM')}`"
            @click.stop="emit('create', toDateInput(day))"
          >
            <Plus class="size-3.5" />
          </button>
        </div>

        <div class="hidden space-y-0.5 sm:block">
          <button
            v-for="event in eventsOn(day).slice(0, visibleCount(day))"
            :key="event.id"
            type="button"
            class="flex w-full items-center gap-1 border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:brightness-95"
            :class="[event.status !== 'planned' && 'text-muted-foreground line-through', event.status === 'cancelled' && 'opacity-60']"
            :style="eventTint(event.category)"
            :title="`${event.allDay ? 'All day' : event.startTime} · ${event.title} · ${categoryInfo(event.category).label}`"
            @click.stop="emit('open', event)"
          >
            <component :is="categoryInfo(event.category).icon" class="size-3 shrink-0" :style="{ color: categoryInfo(event.category).color }" />
            <span v-if="!event.allDay" class="shrink-0 font-medium tabular-nums">{{ event.startTime }}</span>
            <span class="truncate">{{ event.title }}</span>
          </button>
          <button
            v-for="task in tasksOn(day).slice(0, Math.max(0, visibleCount(day) - eventsOn(day).length))"
            :key="task.id"
            type="button"
            class="flex w-full items-center gap-1 truncate border border-dashed border-border px-1.5 py-0.5 text-left text-[11px] leading-tight hover:border-primary/40"
            :class="task.status.category === 'done' && 'text-muted-foreground line-through'"
            :title="`${task.key} ${task.title}`"
            @click.stop="emit('openTask', task.key)"
          >
            <ListTodo class="size-3 shrink-0 text-muted-foreground" /> <span class="truncate">{{ task.title }}</span>
          </button>
          <button
            v-if="eventsOn(day).length + tasksOn(day).length > visibleCount(day)"
            type="button"
            class="px-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary"
            @click.stop="emit('openDay', toDateInput(day))"
          >
            +{{ eventsOn(day).length + tasksOn(day).length - visibleCount(day) }} more
          </button>
        </div>

        <div v-if="eventsOn(day).length || tasksOn(day).length" class="flex flex-wrap gap-0.5 sm:hidden">
          <span v-for="event in eventsOn(day).slice(0, 4)" :key="event.id" class="size-1.5" :style="{ backgroundColor: categoryInfo(event.category).color }" />
          <span v-if="tasksOn(day).length" class="size-1.5 border border-muted-foreground" />
        </div>
      </div>
    </div>
  </div>
</template>
