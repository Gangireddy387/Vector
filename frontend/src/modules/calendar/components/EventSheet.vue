<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from 'date-fns'
import { CalendarPlus, CircleCheck, CircleSlash, Clock3, PencilLine, Trash2, X } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { DatePicker, SelectField, TimeField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { EVENT_CATEGORIES, clockIn, hasStarted, isPastDay, toMinutes } from '../calendar-categories'
import { type CalendarEvent, type EventCategory, type EventStatus, type RepeatFrequency, calendarApi } from '../calendar.api'

export interface EventSheetTarget {
  event?: CalendarEvent
  date?: string
  startTime?: string
}

const target = defineModel<EventSheetTarget | null>('target', { default: null })
const emit = defineEmits<{ changed: [] }>()

const projects = useProjectsStore()
const auth = useAuthStore()
const confirm = useConfirm()
const isSaving = ref(false)
const showErrors = ref(false)

const MAX_REPEATS = 90
const tick = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })
const now = computed(() => clockIn(auth.user?.timezone, tick.value))

const editing = computed(() => target.value?.event ?? null)
const isOpen = computed({
  get: () => target.value !== null,
  set: (open) => {
    if (!open) target.value = null
  },
})

const pad = (value: number) => String(value).padStart(2, '0')
const fromMinutes = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const LAST_SLOT = 23 * 60 + 45
const oneHourAfter = (time: string) => fromMinutes(Math.min(toMinutes(time) + 60, LAST_SLOT))
/** The first 15-minute slot that has not started yet. */
const nextSlot = (time: string) => fromMinutes(Math.min(Math.ceil((toMinutes(time) + 1) / 15) * 15, LAST_SLOT))

const form = reactive({
  title: '',
  category: 'meeting' as EventCategory,
  date: '',
  allDay: false,
  startTime: '09:00',
  endTime: '10:00',
  location: '',
  projectId: null as string | null,
  description: '',
  status: 'planned' as EventStatus,
  repeat: 'none' as RepeatFrequency | 'none',
  until: '',
})

watch(
  target,
  (value) => {
    if (!value) return
    showErrors.value = false
    const event = value.event
    const date = event?.date ?? value.date ?? format(new Date(), 'yyyy-MM-dd')
    const requested = event?.startTime ?? value.startTime ?? '09:00'
    const startTime = !event && date === now.value.date && requested < now.value.time ? nextSlot(now.value.time) : requested
    Object.assign(form, {
      title: event?.title ?? '',
      category: event?.category ?? 'meeting',
      date,
      allDay: event?.allDay ?? false,
      startTime,
      endTime: event?.endTime ?? (event ? '' : oneHourAfter(startTime)),
      location: event?.location ?? '',
      projectId: event?.projectId ?? null,
      description: event?.description ?? '',
      status: event?.status ?? 'planned',
      repeat: 'none',
      until: format(addDays(parseISO(date), 27), 'yyyy-MM-dd'),
    })
  },
  { immediate: true },
)

watch(
  () => form.startTime,
  (start) => {
    if (start && form.endTime && form.endTime <= start) form.endTime = oneHourAfter(start)
  },
)

/** Moving a new event to today skips the slots that already passed. */
watch(
  () => form.date,
  (date) => {
    if (!editing.value && date === now.value.date && !form.allDay && form.startTime < now.value.time) form.startTime = nextSlot(now.value.time)
    if (form.until < date) form.until = format(addDays(parseISO(date), 27), 'yyyy-MM-dd')
  },
)

/** Old events stay editable for tracking; the "not in the past" rules apply once their day or start changes. */
const isRescheduled = computed(() => {
  const event = editing.value
  if (!event) return true
  return form.date !== event.date || form.allDay !== event.allDay || (!form.allDay && form.startTime !== event.startTime)
})
const startsToday = computed(() => form.date === now.value.date)

const occurrenceCount = computed(() => {
  if (form.repeat === 'none' || !form.until || form.until < form.date) return 1
  const start = parseISO(form.date)
  const span = differenceInCalendarDays(parseISO(form.until), start)
  let count = 1
  for (let offset = 1; offset <= span; offset += 1) {
    const weekday = getISODay(addDays(start, offset))
    if (form.repeat === 'daily' || (form.repeat === 'weekdays' && weekday <= 5) || (form.repeat === 'weekly' && offset % 7 === 0)) count += 1
  }
  return count
})

function untilError() {
  if (form.repeat === 'none') return null
  if (!form.until || form.until < form.date) return 'Choose a day on or after the first one'
  if (differenceInCalendarDays(parseISO(form.until), parseISO(form.date)) > 366) return 'A repeat can run for at most a year'
  if (occurrenceCount.value > MAX_REPEATS) return `This creates ${occurrenceCount.value} events; the limit is ${MAX_REPEATS}. Choose an earlier day.`
  return null
}

const errors = computed(() => {
  const title = form.title.trim()
  const timed = !form.allDay
  const marksDone = form.status === 'done' && editing.value?.status !== 'done'
  return {
    title: !title ? 'Give the event a title' : title.length < 2 ? 'Use at least 2 characters' : null,
    date: !form.date
      ? 'Pick a day'
      : isRescheduled.value && isPastDay(form.date, now.value)
        ? 'That day is over. Pick today or a later day.'
        : null,
    start:
      timed && isRescheduled.value && startsToday.value && form.startTime < now.value.time
        ? `It is already ${now.value.time}. Pick a later start time.`
        : null,
    end: !timed ? null : !form.endTime ? 'Choose an end time' : form.endTime <= form.startTime ? 'The event must end after it starts' : null,
    until: untilError(),
    status:
      marksDone && !hasStarted({ date: form.date, allDay: form.allDay, startTime: form.startTime }, now.value)
        ? 'You can mark it done once it has started'
        : null,
  }
})
const hasErrors = computed(() => Object.values(errors.value).some(Boolean))
const errorFor = (key: keyof typeof errors.value) => (showErrors.value ? errors.value[key] : null)

const PROJECT_OPTIONS = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'No project' },
  ...projects.activeProjects.map((project) => ({ value: project.id, label: project.name, description: project.key, color: project.color })),
])
const REPEAT_OPTIONS: SelectFieldOption[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday', description: 'Monday to Friday' },
  { value: 'weekly', label: 'Every week' },
]
const STATUSES: Array<{ value: EventStatus; label: string; icon: typeof Clock3 }> = [
  { value: 'planned', label: 'Planned', icon: Clock3 },
  { value: 'done', label: 'Done', icon: CircleCheck },
  { value: 'cancelled', label: 'Cancelled', icon: CircleSlash },
]

const fields = () => ({
  title: form.title.trim(),
  category: form.category,
  date: form.date,
  allDay: form.allDay,
  startTime: form.allDay ? null : form.startTime,
  endTime: form.allDay ? null : form.endTime || null,
  location: form.location.trim() || null,
  projectId: form.projectId,
  description: form.description.trim() || null,
})

async function save() {
  showErrors.value = true
  if (hasErrors.value) {
    toast.error('Check the highlighted fields', { description: Object.values(errors.value).find(Boolean) ?? undefined })
    return
  }
  isSaving.value = true
  try {
    if (editing.value) {
      await calendarApi.update(editing.value.id, { ...fields(), status: form.status })
      toast.success('Event updated')
    } else {
      const repeat = form.repeat === 'none' ? null : { frequency: form.repeat, until: form.until }
      const created = await calendarApi.create({ ...fields(), repeat })
      toast.success(created.length > 1 ? `${created.length} events scheduled` : 'Event scheduled', { description: form.title.trim() })
    }
    emit('changed')
    target.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function remove(scope: 'one' | 'following') {
  const event = editing.value
  if (!event) return
  const ok = await confirm({
    title: scope === 'following' ? 'Delete this event and its later repeats?' : 'Delete this event?',
    description: scope === 'following' ? 'Earlier days in the series stay as they are.' : event.title,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    const removed = await calendarApi.remove(event.id, scope)
    toast.success(removed.length > 1 ? `${removed.length} events deleted` : 'Event deleted')
    emit('changed')
    target.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-xl" hide-close clear-backdrop @open-auto-focus.prevent>
      <header class="flex shrink-0 items-center gap-3 border-b border-border/70 px-5 py-3.5">
        <span class="flex size-9 shrink-0 items-center justify-center bg-brand text-white shadow-glow">
          <PencilLine v-if="editing" class="size-4" />
          <CalendarPlus v-else class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <SheetTitle class="truncate text-base font-semibold">{{ editing ? 'Edit event' : 'New event' }}</SheetTitle>
          <SheetDescription class="truncate text-xs">Only you see the events in your calendar.</SheetDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="isOpen = false"><X /></Button>
      </header>

      <form class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5" @submit.prevent="save">
        <FormField label="Title" for="event-title" :error="errorFor('title')">
          <Input id="event-title" v-model="form.title" placeholder="e.g. Weekly sync with team leads" maxlength="160" autofocus />
        </FormField>

        <div class="grid gap-1.5">
          <span class="text-sm font-medium">Type</span>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              v-for="category in EVENT_CATEGORIES"
              :key="category.value"
              type="button"
              class="flex items-center gap-2 border px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent"
              :class="form.category === category.value ? 'border-transparent ring-2' : 'border-border/80'"
              :style="form.category === category.value ? { backgroundColor: `${category.color}1a`, '--tw-ring-color': category.color } : undefined"
              :aria-pressed="form.category === category.value"
              @click="form.category = category.value"
            >
              <component :is="category.icon" class="size-4 shrink-0" :style="{ color: category.color }" />
              <span class="truncate">{{ category.label }}</span>
            </button>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormField label="Day" for="event-date" :error="errorFor('date')">
            <DatePicker id="event-date" v-model="form.date" :clearable="false" :min="now.date" />
          </FormField>
          <label class="flex h-9 items-center gap-2 text-sm"><Switch v-model="form.allDay" aria-label="All day" /> All day</label>
        </div>

        <div v-if="!form.allDay" class="grid gap-4 sm:grid-cols-2">
          <FormField label="Starts" for="event-start" :error="errorFor('start')" :hint="startsToday ? 'Times that already passed today are hidden' : undefined">
            <TimeField
              id="event-start"
              v-model="form.startTime"
              aria-label="Start time"
              :min="startsToday ? now.time : undefined"
              empty-text="No times left today. Pick another day."
            />
          </FormField>
          <FormField label="Ends" for="event-end" :error="errorFor('end')">
            <TimeField
              id="event-end"
              v-model="form.endTime"
              aria-label="End time"
              placeholder="Choose an end time"
              :min="fromMinutes(Math.min(toMinutes(form.startTime) + 15, LAST_SLOT))"
            />
          </FormField>
        </div>

        <div v-if="!editing" class="grid gap-4 sm:grid-cols-2">
          <FormField label="Repeat" for="event-repeat">
            <SelectField
              id="event-repeat"
              :model-value="form.repeat"
              :options="REPEAT_OPTIONS"
              @update:model-value="(value) => (form.repeat = (value ?? 'none') as RepeatFrequency | 'none')"
            />
          </FormField>
          <FormField
            v-if="form.repeat !== 'none'"
            label="Until"
            for="event-until"
            :error="showErrors ? errors.until : occurrenceCount > MAX_REPEATS ? errors.until : null"
            :hint="`Creates ${occurrenceCount} event${occurrenceCount === 1 ? '' : 's'} (up to ${MAX_REPEATS})`"
          >
            <DatePicker id="event-until" v-model="form.until" :clearable="false" :presets="false" :min="form.date" />
          </FormField>
        </div>
        <p v-else-if="editing.seriesId" class="border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This event repeats. Changes here apply to this day only.
        </p>
        <p v-if="editing && isPastDay(editing.date, now)" class="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">
          This day is over. You can still update the status and notes, or move the event to today or a later day.
        </p>

        <div v-if="editing" class="grid gap-1.5">
          <span class="text-sm font-medium">Status</span>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="status in STATUSES"
              :key="status.value"
              type="button"
              class="flex items-center justify-center gap-1.5 border px-3 py-2 text-sm font-medium transition-colors"
              :class="
                form.status === status.value
                  ? status.value === 'done'
                    ? 'border-success bg-success/10 text-success'
                    : status.value === 'cancelled'
                      ? 'border-destructive/60 bg-destructive/10 text-destructive'
                      : 'border-primary bg-primary/10 text-primary'
                  : 'border-border/80 hover:bg-accent'
              "
              :aria-pressed="form.status === status.value"
              @click="form.status = status.value"
            >
              <component :is="status.icon" class="size-4" /> {{ status.label }}
            </button>
          </div>
          <p v-if="errors.status" class="text-xs text-destructive" role="alert">{{ errors.status }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="Where" for="event-location" optional>
            <Input id="event-location" v-model="form.location" placeholder="Room 4B or a meeting link" maxlength="300" />
          </FormField>
          <FormField label="Project" for="event-project" optional>
            <SelectField id="event-project" v-model="form.projectId" :options="PROJECT_OPTIONS" placeholder="No project" />
          </FormField>
        </div>

        <FormField label="Notes" for="event-notes" optional>
          <Textarea id="event-notes" v-model="form.description" rows="4" placeholder="Agenda, people to invite, what to prepare…" maxlength="4000" />
        </FormField>

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1" />
      </form>

      <footer class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="brand" :loading="isSaving" @click="save">{{ editing ? 'Save changes' : 'Schedule event' }}</Button>
        <Button variant="ghost" @click="isOpen = false">Cancel</Button>
        <template v-if="editing">
          <Button variant="ghost" class="ml-auto text-destructive" @click="remove('one')"><Trash2 /> Delete</Button>
          <Button v-if="editing.seriesId" variant="ghost" class="text-destructive" @click="remove('following')">Delete later repeats too</Button>
        </template>
      </footer>
    </SheetContent>
  </Sheet>
</template>
