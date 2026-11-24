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
const DAY_NUMBER_PX = 28
const CHIP_PX = 18
const MORE_PX = 15

/** Six equal rows fill the pane; each day shows as many chips as fit, then "+N more". */
const grid = ref<HTMLElement | null>(null)
const { height, width } = useElementSize(grid)
const maxInCell = computed(() => {
  const rowHeight = height.value / 6
  if (!rowHeight) return 2
  return Math.max(0, Math.min(6, Math.floor((rowHeight - DAY_NUMBER_PX - MORE_PX) / CHIP_PX)))
})
/** Narrow cells (split pane): dots only; from ~80px wide cells get title chips. */
const showChips = computed(() => width.value / 7 >= 80)
const visibleCount = (day: Date) => {
  const total = eventsOn(day).length + tasksOn(day).length
  if (!showChips.value) return 0
  return total > maxInCell.value ? maxInCell.value : total
}

const eventsOn = (day: Date) => props.eventsByDay.get(toDateInput(day)) ?? []
const tasksOn = (day: Date) => props.tasksByDay.get(toDateInput(day)) ?? []
const isPast = (day: Date) => toDateInput(day) < props.now.date
const isToday = (day: Date) => toDateInput(day) === props.now.date
const isSelected = (day: Date) => toDateInput(day) === props.selected
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <div class="grid shrink-0 grid-cols-7 border-b border-border/70 bg-muted/30 text-center text-[11px] font-medium tracking-wide text-muted-foreground sm:text-xs">
      <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-2">{{ weekday }}</span>
    </div>
    <div ref="grid" class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
      <div
        v-for="day in days"
        :key="day.toISOString()"
        class="group relative flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r border-b border-border/60 p-1 transition-colors outline-none nth-[7n]:border-r-0 nth-last-[-n+7]:border-b-0 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset sm:p-1.5"
        :class="[
          !isSameMonth(day, cursor) && 'bg-muted/15 text-muted-foreground/55',
          isWeekend(day) && isSameMonth(day, cursor) && 'bg-muted/[0.07]',
          isSelected(day) && 'bg-primary/[0.07]',
        ]"
        role="button"
        tabindex="0"
        :aria-label="`${format(day, 'EEEE d MMMM')}: ${eventsOn(day).length} events`"
        :aria-pressed="isSelected(day)"
        @click="emit('select', toDateInput(day))"
        @dblclick="!isPast(day) && emit('create', toDateInput(day))"
        @keydown.enter="emit('select', toDateInput(day))"
      >
        <div
          v-if="isSelected(day)"
          class="pointer-events-none absolute inset-0 ring-2 ring-primary/35 ring-inset"
          aria-hidden="true"
        />
        <div class="relative z-[1] flex shrink-0 items-center justify-between gap-1">
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors hover:bg-accent sm:size-7"
            :class="
              isToday(day)
                ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary'
                : isPast(day)
                  ? 'text-muted-foreground/70'
                  : ''
            "
            :title="`Open ${format(day, 'EEEE d MMMM')}`"
            @click.stop="emit('openDay', toDateInput(day))"
          >
            {{ format(day, 'd') }}
          </button>
          <button
            v-if="!isPast(day)"
            type="button"
            class="flex size-5 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            :aria-label="`Add an event on ${format(day, 'd MMMM')}`"
            @click.stop="emit('create', toDateInput(day))"
          >
            <Plus class="size-3.5" />
          </button>
        </div>

        <div v-if="showChips && maxInCell > 0" class="relative z-[1] min-h-0 flex-1 space-y-0.5 overflow-hidden">
          <button
            v-for="event in eventsOn(day).slice(0, visibleCount(day))"
            :key="event.id"
            type="button"
            class="flex h-[17px] w-full items-center gap-0.5 truncate rounded-sm border-l-2 px-1 text-left text-[10px] leading-none transition-colors hover:brightness-95 xl:h-[18px] xl:gap-1 xl:px-1.5 xl:text-[11px]"
            :class="[event.status !== 'planned' && 'text-muted-foreground line-through', event.status === 'cancelled' && 'opacity-60']"
            :style="eventTint(event.category)"
            :title="`${event.allDay ? 'All day' : event.startTime} · ${event.title}${event.owner ? ` · ${event.owner.name}` : ''} · ${categoryInfo(event.category).label}`"
            @click.stop="emit('open', event)"
          >
            <component :is="categoryInfo(event.category).icon" class="size-2.5 shrink-0 xl:size-3" :style="{ color: categoryInfo(event.category).color }" />
            <span v-if="!event.allDay" class="hidden shrink-0 font-medium tabular-nums 2xl:inline">{{ event.startTime }}</span>
            <span class="min-w-0 truncate">{{ event.title }}</span>
          </button>
          <button
            v-for="task in tasksOn(day).slice(0, Math.max(0, visibleCount(day) - eventsOn(day).length))"
            :key="task.id"
            type="button"
            class="flex h-[17px] w-full items-center gap-0.5 truncate rounded-sm border border-dashed border-border px-1 text-left text-[10px] leading-none hover:border-primary/40 xl:h-[18px] xl:gap-1 xl:px-1.5 xl:text-[11px]"
            :class="task.status.category === 'done' && 'text-muted-foreground line-through'"
            :title="`${task.key} ${task.title}`"
            @click.stop="emit('openTask', task.key)"
          >
            <ListTodo class="size-2.5 shrink-0 text-muted-foreground xl:size-3" />
            <span class="min-w-0 truncate">{{ task.title }}</span>
          </button>
          <button
            v-if="eventsOn(day).length + tasksOn(day).length > visibleCount(day)"
            type="button"
            class="px-1 text-[10px] font-medium text-muted-foreground hover:text-primary xl:text-[11px]"
            @click.stop="emit('openDay', toDateInput(day))"
          >
            +{{ eventsOn(day).length + tasksOn(day).length - visibleCount(day) }} more
          </button>
        </div>

        <div
          v-else-if="eventsOn(day).length || tasksOn(day).length"
          class="relative z-[1] mt-auto flex flex-wrap gap-0.5 px-0.5 pb-0.5"
        >
          <span
            v-for="event in eventsOn(day).slice(0, 4)"
            :key="event.id"
            class="size-1.5 rounded-full"
            :style="{ backgroundColor: categoryInfo(event.category).color }"
          />
          <span v-if="tasksOn(day).length" class="size-1.5 rounded-full border border-muted-foreground" />
          <span
            v-if="eventsOn(day).length + (tasksOn(day).length ? 1 : 0) > 4"
            class="text-[9px] font-medium leading-none text-muted-foreground"
          >
            +{{ eventsOn(day).length + (tasksOn(day).length ? 1 : 0) - 4 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
