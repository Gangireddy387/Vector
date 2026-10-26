<script setup lang="ts">
import { format, isToday, parseISO } from 'date-fns'
import { CalendarCheck2, FolderKanban, ListTodo, MapPin, Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import type { Issue } from '@/types/models'
import { type Clock, categoryInfo, durationMinutes, formatHours, hasStarted, isPastDay, timeLabel } from '../calendar-categories'
import type { CalendarEvent } from '../calendar.api'

const props = defineProps<{ date: string; events: CalendarEvent[]; tasks: Issue[]; now: Clock }>()
const emit = defineEmits<{ open: [event: CalendarEvent]; toggle: [event: CalendarEvent]; create: []; openTask: [key: string] }>()

const day = computed(() => parseISO(props.date))
const active = computed(() => props.events.filter((event) => event.status !== 'cancelled'))
const done = computed(() => active.value.filter((event) => event.status === 'done').length)
const percent = computed(() => (active.value.length ? Math.round((done.value / active.value.length) * 100) : 0))
const scheduled = computed(() => active.value.reduce((total, event) => total + durationMinutes(event), 0))

const isOver = computed(() => isPastDay(props.date, props.now))
const canTick = (event: CalendarEvent) => event.status === 'done' || (event.status === 'planned' && hasStarted(event, props.now))
const tickLabel = (event: CalendarEvent) =>
  event.status === 'done' ? `Mark ${event.title} as not done` : canTick(event) ? `Mark ${event.title} as done` : `${event.title} has not started yet`

const isLink = (value: string) => /^https?:\/\//i.test(value)
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden border border-border/80 bg-card shadow-soft" aria-live="polite">
    <header class="shrink-0 space-y-3 border-b border-border/70 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold tracking-wider uppercase" :class="isToday(day) ? 'text-brand' : 'text-muted-foreground'">
            {{ isToday(day) ? 'Today' : format(day, 'EEEE') }}
          </p>
          <h2 class="truncate text-lg font-semibold tracking-tight">{{ format(day, 'EEEE, d MMMM') }}</h2>
        </div>
        <Button v-if="!isOver" variant="soft" size="sm" @click="emit('create')"><Plus /> Add</Button>
      </div>
      <p v-if="isOver" class="text-xs text-muted-foreground">This day is over. Tick off what you finished; new events go on today or later.</p>
      <div v-if="active.length" class="space-y-1.5">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span>{{ done }} of {{ active.length }} done</span>
          <span>{{ formatHours(scheduled) }} scheduled</span>
        </div>
        <Progress :model-value="percent" class="h-1.5" />
      </div>
    </header>

    <div class="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto scrollbar-thin">
      <div v-if="!events.length && !tasks.length" class="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <span class="flex size-11 items-center justify-center bg-primary/10 text-primary"><CalendarCheck2 class="size-5" /></span>
        <div class="space-y-1">
          <p class="text-sm font-medium">{{ isOver ? 'Nothing was planned' : 'Nothing planned' }}</p>
          <p v-if="!isOver" class="text-xs text-muted-foreground">Block time for meetings, reviews and focus work.</p>
        </div>
        <Button v-if="!isOver" variant="outline" size="sm" @click="emit('create')"><Plus /> Plan this day</Button>
      </div>

      <div
        v-for="event in events"
        :key="event.id"
        class="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
        :class="event.status === 'cancelled' && 'opacity-60'"
        role="button"
        tabindex="0"
        @click="emit('open', event)"
        @keydown.enter="emit('open', event)"
      >
        <Checkbox
          class="mt-0.5"
          :model-value="event.status === 'done'"
          :disabled="!canTick(event)"
          :title="canTick(event) ? undefined : event.status === 'cancelled' ? 'Cancelled' : 'You can tick it off once it has started'"
          :aria-label="tickLabel(event)"
          @click.stop
          @update:model-value="emit('toggle', event)"
        />
        <span class="mt-0.5 h-10 w-1 shrink-0" :style="{ backgroundColor: categoryInfo(event.category).color }" />
        <div class="min-w-0 flex-1 space-y-1">
          <p class="truncate text-sm font-medium" :class="event.status !== 'planned' && 'text-muted-foreground line-through'">{{ event.title }}</p>
          <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span class="font-medium tabular-nums">{{ timeLabel(event) }}</span>
            <span class="inline-flex items-center gap-1">
              <component :is="categoryInfo(event.category).icon" class="size-3" :style="{ color: categoryInfo(event.category).color }" />
              {{ categoryInfo(event.category).label }}
            </span>
            <Badge v-if="event.status === 'cancelled'" variant="destructive" class="px-1.5 py-0 text-[10px]">Cancelled</Badge>
          </p>
          <p v-if="event.location" class="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin class="size-3 shrink-0" />
            <a v-if="isLink(event.location)" :href="event.location" target="_blank" rel="noopener" class="truncate text-primary hover:underline" @click.stop>
              {{ event.location }}
            </a>
            <span v-else class="truncate">{{ event.location }}</span>
          </p>
          <p v-if="event.project" class="flex items-center gap-1 text-xs text-muted-foreground">
            <FolderKanban class="size-3 shrink-0" /> <span class="truncate">{{ event.project.name }}</span>
          </p>
        </div>
      </div>

      <div v-if="tasks.length" class="px-4 py-3">
        <p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <ListTodo class="size-3.5" /> Your tasks due
        </p>
        <ul class="space-y-1">
          <li v-for="task in tasks" :key="task.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 border border-dashed border-border/80 px-2.5 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              @click="emit('openTask', task.key)"
            >
              <span class="font-mono text-[11px] text-muted-foreground">{{ task.key }}</span>
              <span class="min-w-0 flex-1 truncate" :class="task.status.category === 'done' && 'text-muted-foreground line-through'">{{ task.title }}</span>
              <span class="size-2 shrink-0" :style="{ backgroundColor: task.status.color }" :title="task.status.name" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
