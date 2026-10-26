<script setup lang="ts">
import { addDays, format, getDaysInMonth, getISODay } from 'date-fns'
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { Progress } from '@/components/ui/progress'
import { toDateInput } from '@/lib/format'
import type { Issue } from '@/types/models'
import type { Clock } from '../calendar-categories'
import type { CalendarEvent } from '../calendar.api'

const props = defineProps<{
  year: number
  selected: string
  now: Clock
  eventsByDay: Map<string, CalendarEvent[]>
  tasksByDay: Map<string, Issue[]>
}>()
const emit = defineEmits<{ select: [date: string]; openMonth: [date: string] }>()

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const activeOn = (date: string) => (props.eventsByDay.get(date) ?? []).filter((event) => event.status !== 'cancelled')

const months = computed(() =>
  Array.from({ length: 12 }, (_, month) => {
    const first = new Date(props.year, month, 1)
    const days = Array.from({ length: getDaysInMonth(first) }, (_, index) => {
      const date = toDateInput(addDays(first, index))
      const events = activeOn(date)
      return { date, number: index + 1, count: events.length, done: events.filter((event) => event.status === 'done').length, tasks: (props.tasksByDay.get(date) ?? []).length }
    })
    const planned = days.reduce((total, day) => total + day.count, 0)
    const done = days.reduce((total, day) => total + day.done, 0)
    return {
      key: toDateInput(first),
      name: format(first, 'MMMM'),
      isCurrent: props.now.date.slice(0, 7) === toDateInput(first).slice(0, 7),
      leading: getISODay(first) - 1,
      days,
      planned,
      percent: planned ? Math.round((done / planned) * 100) : 0,
    }
  }),
)

/** Busier days get a stronger wash, like a contribution graph. */
const intensity = (count: number) => (count >= 4 ? 'bg-primary/55 text-primary-foreground' : count === 3 ? 'bg-primary/40' : count === 2 ? 'bg-primary/25' : count === 1 ? 'bg-primary/12' : '')

const describe = (day: { date: string; count: number; done: number; tasks: number }) =>
  [format(new Date(`${day.date}T00:00:00`), 'EEEE d MMMM'), `${day.count} event${day.count === 1 ? '' : 's'}${day.count ? `, ${day.done} done` : ''}`, day.tasks ? `${day.tasks} task${day.tasks === 1 ? '' : 's'} due` : '']
    .filter(Boolean)
    .join(' · ')
</script>

<template>
  <div class="space-y-4 p-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <section
        v-for="month in months"
        :key="month.key"
        class="border bg-card p-3 transition-colors"
        :class="month.isCurrent ? 'border-primary/40 shadow-soft' : 'border-border/70'"
      >
        <header class="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            class="group flex items-center gap-1 text-sm font-semibold tracking-tight transition-colors hover:text-primary"
            :class="month.isCurrent && 'text-brand'"
            :title="`Open ${month.name}`"
            @click="emit('openMonth', month.key)"
          >
            {{ month.name }}
            <ChevronRight class="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <span class="text-[11px] text-muted-foreground tabular-nums">
            {{ month.planned ? `${month.planned} event${month.planned === 1 ? '' : 's'} · ${month.percent}% done` : 'No events' }}
          </span>
        </header>

        <div class="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground">
          <span v-for="(weekday, index) in WEEKDAYS" :key="index" class="py-0.5">{{ weekday }}</span>
          <span v-for="index in month.leading" :key="`lead-${index}`" />
          <button
            v-for="day in month.days"
            :key="day.date"
            type="button"
            class="relative flex aspect-square items-center justify-center text-[11px] tabular-nums transition-colors hover:ring-1 hover:ring-primary/50"
            :class="[
              day.date === selected ? 'bg-primary font-semibold text-primary-foreground' : intensity(day.count),
              day.date === now.date && day.date !== selected && 'font-bold text-brand ring-1 ring-brand',
              day.date < now.date && day.date !== selected && !day.count && 'text-muted-foreground/50',
              day.date >= now.date && day.date !== selected && !day.count && 'text-foreground/80',
            ]"
            :title="describe(day)"
            :aria-label="describe(day)"
            :aria-pressed="day.date === selected"
            @click="emit('select', day.date)"
          >
            {{ day.number }}
            <span v-if="day.tasks" class="absolute bottom-0.5 size-1 rounded-full" :class="day.date === selected ? 'bg-primary-foreground' : 'bg-violet-500'" />
          </button>
        </div>

        <Progress v-if="month.planned" :model-value="month.percent" class="mt-3 h-1" indicator-class="bg-success" />
      </section>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-4 text-[11px] text-muted-foreground">
      <span class="flex items-center gap-1.5">
        Fewer
        <span class="size-3 border border-border/70" />
        <span class="size-3 bg-primary/12" />
        <span class="size-3 bg-primary/25" />
        <span class="size-3 bg-primary/40" />
        <span class="size-3 bg-primary/55" />
        More events
      </span>
      <span class="flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-violet-500" /> Task due</span>
    </div>
  </div>
</template>
