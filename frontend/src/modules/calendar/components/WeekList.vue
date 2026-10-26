<script setup lang="ts">
import { format } from 'date-fns'
import { ListTodo, Plus } from 'lucide-vue-next'
import { toDateInput } from '@/lib/format'
import type { Issue } from '@/types/models'
import { type Clock, categoryInfo, eventTint, timeLabel } from '../calendar-categories'
import type { CalendarEvent } from '../calendar.api'

/** The week as a list of days, for screens too narrow for a seven-column timeline. */
const props = defineProps<{
  days: Date[]
  selected: string
  now: Clock
  eventsByDay: Map<string, CalendarEvent[]>
  tasksByDay: Map<string, Issue[]>
}>()
const emit = defineEmits<{ create: [date: string]; open: [event: CalendarEvent]; openTask: [key: string]; openDay: [date: string] }>()

const eventsOn = (day: Date) => props.eventsByDay.get(toDateInput(day)) ?? []
const tasksOn = (day: Date) => props.tasksByDay.get(toDateInput(day)) ?? []
</script>

<template>
  <div class="divide-y divide-border/60">
    <div v-for="day in days" :key="day.toISOString()" class="flex gap-3 px-3 py-3" :class="toDateInput(day) === selected && 'bg-primary/5'">
      <button type="button" class="flex w-11 shrink-0 flex-col items-center pt-0.5" @click="emit('openDay', toDateInput(day))">
        <span class="text-[11px] font-semibold tracking-wider uppercase" :class="toDateInput(day) === now.date ? 'text-brand' : 'text-muted-foreground'">
          {{ format(day, 'EEE') }}
        </span>
        <span
          class="flex size-8 items-center justify-center text-base font-semibold tabular-nums"
          :class="toDateInput(day) === now.date ? 'bg-brand text-white' : toDateInput(day) < now.date ? 'text-muted-foreground' : ''"
        >
          {{ format(day, 'd') }}
        </span>
      </button>
      <div class="min-w-0 flex-1 space-y-1.5">
        <button
          v-for="event in eventsOn(day)"
          :key="event.id"
          type="button"
          class="block w-full border-l-2 px-2 py-1.5 text-left"
          :class="event.status === 'cancelled' && 'opacity-60'"
          :style="eventTint(event.category)"
          @click="emit('open', event)"
        >
          <span class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground tabular-nums">
            {{ timeLabel(event) }} ·
            <component :is="categoryInfo(event.category).icon" class="size-3" :style="{ color: categoryInfo(event.category).color }" />
            {{ categoryInfo(event.category).label }}
          </span>
          <span class="block truncate text-sm font-medium" :class="event.status !== 'planned' && 'text-muted-foreground line-through'">{{ event.title }}</span>
        </button>
        <button
          v-for="task in tasksOn(day)"
          :key="task.id"
          type="button"
          class="flex w-full items-center gap-1.5 border border-dashed border-border px-2 py-1.5 text-left text-sm"
          :class="task.status.category === 'done' && 'text-muted-foreground line-through'"
          @click="emit('openTask', task.key)"
        >
          <ListTodo class="size-3.5 shrink-0 text-muted-foreground" /> <span class="truncate">{{ task.title }}</span>
        </button>
        <p v-if="!eventsOn(day).length && !tasksOn(day).length" class="py-1.5 text-xs text-muted-foreground">Nothing planned</p>
      </div>
      <button
        v-if="toDateInput(day) >= now.date"
        type="button"
        class="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        :aria-label="`Add an event on ${format(day, 'd MMMM')}`"
        @click="emit('create', toDateInput(day))"
      >
        <Plus class="size-4" />
      </button>
    </div>
  </div>
</template>
