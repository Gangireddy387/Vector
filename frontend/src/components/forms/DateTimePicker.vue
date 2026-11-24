<script setup lang="ts">
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, X } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDevice } from '@/composables/useDevice'
import { toDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type FieldSize, fieldPanelClass, fieldTriggerVariants } from './field-styles'

/**
 * Combined date + time field.
 * Value is local `YYYY-MM-DDTHH:mm`; empty string means unset.
 * Free hour/minute choice (any minute), live system clock, Use now / presets.
 */
const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    size?: FieldSize
    id?: string
    ariaLabel?: string
    class?: string
    /** Earliest selectable day (`YYYY-MM-DD`). */
    min?: string
    /** Default time when only a future day is chosen. */
    defaultTime?: string
  }>(),
  {
    placeholder: 'Pick date & time',
    clearable: true,
    size: 'default',
    defaultTime: '17:00',
  },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ change: [value: string] }>()

const { isPhone } = useDevice()
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const timeSelectClass =
  'h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-center text-sm tabular-nums shadow-soft outline-none hover:border-input focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50'

const open = ref(false)
const viewMonth = ref(startOfMonth(new Date()))
const focusedDay = ref(new Date())
const draftDate = ref('')
const draftHour = ref('17')
const draftMinute = ref('00')
const grid = ref<HTMLElement | null>(null)
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

function parseModel(value: string) {
  if (!value.trim()) return null
  const date = parseISO(value.length === 16 ? `${value}:00` : value)
  return isValid(date) ? date : null
}

function splitTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  return match ? { hour: match[1]!, minute: match[2]! } : { hour: '17', minute: '00' }
}

function setDraftTime(value: string) {
  const parts = splitTime(value || props.defaultTime)
  draftHour.value = parts.hour
  draftMinute.value = parts.minute
}

const draftTime = computed(() => `${draftHour.value}:${draftMinute.value}`)
const selected = computed(() => parseModel(model.value))
const label = computed(() =>
  selected.value ? format(selected.value, 'd MMM yyyy · HH:mm') : props.placeholder,
)
const systemTimeLabel = computed(() => format(now.value, 'HH:mm:ss'))
const systemDateLabel = computed(() => format(now.value, 'd MMM yyyy'))
const todayStr = computed(() => toDateInput(now.value))
const currentClock = computed(() => format(now.value, 'HH:mm'))
const isPastToday = computed(
  () => Boolean(draftDate.value) && draftDate.value === todayStr.value && draftTime.value < currentClock.value,
)

const days = computed(() => {
  const first = startOfWeek(viewMonth.value, { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, index) => addDays(first, index))
})

const quickPresets = computed(() => {
  const anchor = now.value
  return [
    { label: 'Tonight', date: setMinutes(setHours(anchor, 23), 59) },
    { label: 'Tomorrow', date: setMinutes(setHours(addDays(anchor, 1), 17), 0) },
    { label: '7 days', date: setMinutes(setHours(addDays(anchor, 7), 17), 0) },
    { label: '30 days', date: setMinutes(setHours(addDays(anchor, 30), 17), 0) },
  ]
})

function startClock() {
  now.value = new Date()
  stopClock()
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
}

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

watch(open, (isOpen) => {
  if (!isOpen) {
    stopClock()
    // Closing without Done still keeps a complete day+time choice (avoids “set but not saved”).
    if (draftDate.value) {
      const next = `${draftDate.value}T${draftTime.value || props.defaultTime}`
      if (next !== model.value) {
        model.value = next
        emit('change', next)
      }
    }
    return
  }
  startClock()
  const anchor = selected.value ?? now.value
  viewMonth.value = startOfMonth(anchor)
  focusedDay.value = anchor
  draftDate.value = selected.value ? toDateInput(selected.value) : ''
  setDraftTime(selected.value ? format(selected.value, 'HH:mm') : props.defaultTime)
})

onBeforeUnmount(stopClock)

function toLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

function commit(value: string) {
  model.value = value
  emit('change', value)
  open.value = false
}

function commitFromParts(dateStr: string, timeStr: string) {
  if (!dateStr) {
    commit('')
    return
  }
  const time = timeStr || props.defaultTime
  const date = parseISO(`${dateStr}T${time}:00`)
  if (!isValid(date)) return
  commit(toLocalValue(date))
}

const isBeforeMin = (day: Date) => Boolean(props.min) && toDateInput(day) < props.min!
const isDisabledDay = (day: Date) => isBeforeMin(day)

function chooseDay(day: Date) {
  if (isDisabledDay(day)) return
  draftDate.value = toDateInput(day)
  focusedDay.value = day
  if (!draftHour.value) setDraftTime(props.defaultTime)
}

function useNow() {
  const stamp = now.value
  draftDate.value = toDateInput(stamp)
  setDraftTime(format(stamp, 'HH:mm'))
  viewMonth.value = startOfMonth(stamp)
  focusedDay.value = stamp
  commitFromParts(draftDate.value, draftTime.value)
}

function applyPreset(date: Date) {
  if (isDisabledDay(date)) return
  commit(toLocalValue(date))
}

function applyDraft() {
  if (!draftDate.value) return
  commitFromParts(draftDate.value, draftTime.value || props.defaultTime)
}

function clear() {
  draftDate.value = ''
  setDraftTime(props.defaultTime)
  commit('')
}

const shiftMonth = (step: number) => (viewMonth.value = addMonths(viewMonth.value, step))

async function focusDay(day: Date) {
  focusedDay.value = day
  if (!isSameMonth(day, viewMonth.value)) viewMonth.value = startOfMonth(day)
  await nextTick()
  grid.value?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus()
}

function onGridKeydown(event: KeyboardEvent) {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (event.key in steps) {
    event.preventDefault()
    void focusDay(addDays(focusedDay.value, steps[event.key]!))
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    chooseDay(focusedDay.value)
  }
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  void nextTick(() => grid.value?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus())
}

const dayButtonClass = (day: Date) => {
  const selectedDay = draftDate.value && isSameDay(day, parseISO(draftDate.value))
  const disabled = isDisabledDay(day)
  return [
    selectedDay
      ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
      : disabled
        ? 'cursor-not-allowed text-muted-foreground/35 line-through decoration-muted-foreground/30'
        : isSameMonth(day, viewMonth.value)
          ? 'hover:bg-accent hover:text-accent-foreground active:bg-accent'
          : 'text-muted-foreground/45 hover:bg-accent/60',
    isToday(day) && !selectedDay && 'font-semibold text-primary',
  ]
}
</script>

<template>
  <template v-if="isPhone">
    <button
      :id="id"
      type="button"
      :aria-label="ariaLabel ?? (selected ? `Date and time: ${label}` : placeholder)"
      :disabled="disabled"
      :data-state="open ? 'open' : 'closed'"
      :class="cn(fieldTriggerVariants({ size }), 'min-h-10 touch-manipulation', props.class)"
      @click="open = true"
    >
      <CalendarClock class="size-4 shrink-0" :class="selected ? 'text-primary' : 'text-muted-foreground'" />
      <span class="min-w-0 flex-1 truncate" :class="!selected && 'text-muted-foreground'">{{ label }}</span>
      <button
        v-if="clearable && model && !disabled"
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Clear date and time"
        @click.stop="clear"
      >
        <X class="size-3.5" />
      </button>
    </button>

    <Sheet :open="open" @update:open="(value: boolean) => (open = value)">
      <SheetContent side="bottom" class="gap-0 p-0 pb-safe" hide-close>
        <SheetHeader class="border-b px-4 py-3 text-left">
          <SheetTitle class="text-base">{{ ariaLabel || placeholder }}</SheetTitle>
        </SheetHeader>
        <div class="space-y-4 px-4 pb-4 pt-3">
          <div class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">System time</p>
              <p class="text-sm font-semibold tabular-nums">
                {{ systemDateLabel }} · <span class="text-primary">{{ systemTimeLabel }}</span>
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" class="shrink-0 touch-manipulation" @click="useNow">Use now</Button>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              v-for="preset in quickPresets"
              :key="preset.label"
              type="button"
              variant="outline"
              size="sm"
              class="touch-manipulation"
              :disabled="isDisabledDay(preset.date)"
              @click="applyPreset(preset.date)"
            >
              {{ preset.label }}
            </Button>
          </div>

          <div class="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" class="size-10" aria-label="Previous month" @click="shiftMonth(-1)">
              <ChevronLeft class="size-5" />
            </Button>
            <p class="text-base font-semibold" aria-live="polite">{{ format(viewMonth, 'MMMM yyyy') }}</p>
            <Button type="button" variant="ghost" size="icon" class="size-10" aria-label="Next month" @click="shiftMonth(1)">
              <ChevronRight class="size-5" />
            </Button>
          </div>

          <div class="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
            <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-2">{{ weekday }}</span>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <button
              v-for="day in days"
              :key="day.toISOString()"
              type="button"
              class="relative flex h-11 items-center justify-center rounded-lg text-sm tabular-nums transition-colors touch-manipulation"
              :class="dayButtonClass(day)"
              :aria-label="format(day, 'EEEE, d MMMM yyyy')"
              :aria-disabled="isDisabledDay(day) || undefined"
              @click="chooseDay(day)"
            >
              {{ format(day, 'd') }}
            </button>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs font-medium text-muted-foreground">Time — any hour & minute</p>
            <div class="flex items-center gap-2">
              <Clock class="size-4 shrink-0 text-muted-foreground" />
              <select
                :id="id ? `${id}-hour` : undefined"
                v-model="draftHour"
                :disabled="!draftDate"
                :class="timeSelectClass"
                aria-label="Hour"
              >
                <option v-for="hour in HOURS" :key="hour" :value="hour">{{ hour }}</option>
              </select>
              <span class="text-sm font-semibold text-muted-foreground">:</span>
              <select v-model="draftMinute" :disabled="!draftDate" :class="timeSelectClass" aria-label="Minute">
                <option v-for="minute in MINUTES" :key="minute" :value="minute">{{ minute }}</option>
              </select>
            </div>
            <p v-if="isPastToday" class="text-[11px] text-amber-700 dark:text-amber-300">That time is earlier than now ({{ currentClock }}).</p>
          </div>

          <div class="flex gap-2 border-t border-border/70 pt-3">
            <Button v-if="clearable && (model || draftDate)" type="button" variant="ghost" class="text-muted-foreground" @click="clear">
              Clear
            </Button>
            <Button type="button" class="ml-auto" :disabled="!draftDate" @click="applyDraft">Done</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </template>

  <PopoverRoot v-else v-model:open="open">
    <PopoverTrigger as-child>
      <button
        :id="id"
        type="button"
        :aria-label="ariaLabel ?? (selected ? `Date and time: ${label}` : placeholder)"
        :disabled="disabled"
        :data-state="open ? 'open' : 'closed'"
        :class="cn(fieldTriggerVariants({ size }), props.class)"
      >
        <CalendarClock class="size-4 shrink-0" :class="selected ? 'text-primary' : 'text-muted-foreground'" />
        <span class="min-w-0 flex-1 truncate" :class="!selected && 'text-muted-foreground'">{{ label }}</span>
        <button
          v-if="clearable && model && !disabled"
          type="button"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear date and time"
          @click.stop="clear"
        >
          <X class="size-3.5" />
        </button>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="4"
        :collision-padding="12"
        :class="cn(fieldPanelClass, 'w-[min(20rem,calc(100vw-1.5rem))] p-3')"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div class="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
          <div class="min-w-0">
            <p class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">System time</p>
            <p class="text-xs font-semibold tabular-nums">
              {{ systemDateLabel }} · <span class="text-primary">{{ systemTimeLabel }}</span>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md border border-border/80 px-2 py-1 text-xs font-medium hover:border-primary/40 hover:bg-accent"
            @click="useNow"
          >
            Use now
          </button>
        </div>

        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            v-for="preset in quickPresets"
            :key="preset.label"
            type="button"
            class="rounded-md border border-border/80 px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
            :disabled="isDisabledDay(preset.date)"
            @click="applyPreset(preset.date)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Previous month"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft class="size-4" />
          </button>
          <p class="text-sm font-semibold" aria-live="polite">{{ format(viewMonth, 'MMMM yyyy') }}</p>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Next month"
            @click="shiftMonth(1)"
          >
            <ChevronRight class="size-4" />
          </button>
        </div>

        <div class="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
          <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-1.5">{{ weekday }}</span>
        </div>
        <div ref="grid" class="grid grid-cols-7 gap-px" role="grid" @keydown="onGridKeydown">
          <button
            v-for="day in days"
            :key="day.toISOString()"
            type="button"
            role="gridcell"
            :tabindex="isSameDay(day, focusedDay) ? 0 : -1"
            :data-focused="isSameDay(day, focusedDay)"
            :aria-selected="draftDate ? isSameDay(day, parseISO(draftDate)) : false"
            :aria-disabled="isDisabledDay(day) || undefined"
            :aria-label="format(day, 'EEEE, d MMMM yyyy')"
            class="relative flex h-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :class="dayButtonClass(day)"
            @click="chooseDay(day)"
          >
            {{ format(day, 'd') }}
            <span
              v-if="isToday(day)"
              class="absolute bottom-1 h-0.5 w-3 rounded-full"
              :class="draftDate && isSameDay(day, parseISO(draftDate)) ? 'bg-primary-foreground' : 'bg-primary'"
            />
          </button>
        </div>

        <div class="mt-3 space-y-1.5 border-t border-border/70 pt-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-medium text-muted-foreground">Time — any hour & minute</p>
            <p v-if="draftDate" class="text-xs tabular-nums text-foreground">{{ format(parseISO(draftDate), 'd MMM') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Clock class="size-4 shrink-0 text-muted-foreground" />
            <select
              :id="id ? `${id}-hour` : undefined"
              v-model="draftHour"
              :disabled="!draftDate"
              :class="timeSelectClass"
              aria-label="Hour"
            >
              <option v-for="hour in HOURS" :key="hour" :value="hour">{{ hour }}</option>
            </select>
            <span class="text-sm font-semibold text-muted-foreground">:</span>
            <select v-model="draftMinute" :disabled="!draftDate" :class="timeSelectClass" aria-label="Minute">
              <option v-for="minute in MINUTES" :key="minute" :value="minute">{{ minute }}</option>
            </select>
          </div>
          <p v-if="isPastToday" class="text-[11px] text-amber-700 dark:text-amber-300">Earlier than system time ({{ currentClock }}).</p>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <button
            v-if="clearable && (model || draftDate)"
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            @click="clear"
          >
            Clear
          </button>
          <span v-else />
          <button
            type="button"
            class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
            :disabled="!draftDate"
            @click="applyDraft"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
