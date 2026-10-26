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
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { toDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type FieldSize, fieldPanelClass, fieldTriggerVariants } from './field-styles'

/** Custom calendar date field. The value is a local `YYYY-MM-DD` string; an empty string means "no date". */
const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    presets?: boolean
    size?: FieldSize
    id?: string
    ariaLabel?: string
    displayFormat?: string
    class?: string
    /** Earliest selectable day (`YYYY-MM-DD`); earlier days are shown but cannot be picked. */
    min?: string
  }>(),
  { placeholder: 'Pick a date', clearable: true, presets: true, size: 'default', displayFormat: 'EEE, d MMM yyyy' },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ change: [value: string] }>()

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const open = ref(false)
const viewMonth = ref(startOfMonth(new Date()))
const focusedDay = ref(new Date())
const grid = ref<HTMLElement | null>(null)

const selectedDate = computed(() => {
  if (!model.value) return null
  const date = parseISO(model.value)
  return isValid(date) ? date : null
})
const label = computed(() => (selectedDate.value ? format(selectedDate.value, props.displayFormat) : props.placeholder))

const days = computed(() => {
  const first = startOfWeek(viewMonth.value, { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, index) => addDays(first, index))
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const anchor = selectedDate.value ?? new Date()
  viewMonth.value = startOfMonth(anchor)
  focusedDay.value = anchor
})

function commit(value: string) {
  model.value = value
  emit('change', value)
  open.value = false
}

const isBeforeMin = (day: Date) => Boolean(props.min) && toDateInput(day) < props.min!
const choose = (day: Date) => {
  if (!isBeforeMin(day)) commit(toDateInput(day))
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
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    void focusDay(addMonths(focusedDay.value, event.key === 'PageUp' ? -1 : 1))
  }
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  void nextTick(() => grid.value?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus())
}

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
]
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        :id="id"
        type="button"
        :aria-label="ariaLabel ?? (selectedDate ? `Date: ${label}` : placeholder)"
        :disabled="disabled"
        :data-state="open ? 'open' : 'closed'"
        :class="cn(fieldTriggerVariants({ size }), props.class)"
      >
        <CalendarDays class="size-4 shrink-0" :class="selectedDate ? 'text-primary' : 'text-muted-foreground'" />
        <span class="truncate" :class="!selectedDate && 'text-muted-foreground'">{{ label }}</span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent align="start" :side-offset="4" :class="cn(fieldPanelClass, 'w-[18.5rem] p-3')" @open-auto-focus="onOpenAutoFocus">
        <div class="mb-2 flex items-center justify-between">
          <button type="button" class="flex size-8 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Previous month" @click="shiftMonth(-1)">
            <ChevronLeft class="size-4" />
          </button>
          <p class="text-sm font-semibold" aria-live="polite">{{ format(viewMonth, 'MMMM yyyy') }}</p>
          <button type="button" class="flex size-8 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Next month" @click="shiftMonth(1)">
            <ChevronRight class="size-4" />
          </button>
        </div>

        <div class="grid grid-cols-7 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
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
            :aria-selected="selectedDate ? isSameDay(day, selectedDate) : false"
            :aria-disabled="isBeforeMin(day) || undefined"
            :aria-label="format(day, 'EEEE, d MMMM yyyy')"
            class="relative flex h-9 items-center justify-center text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :class="[
              selectedDate && isSameDay(day, selectedDate)
                ? 'bg-primary font-semibold text-primary-foreground'
                : isBeforeMin(day)
                  ? 'cursor-not-allowed text-muted-foreground/35 line-through decoration-muted-foreground/30'
                  : isSameMonth(day, viewMonth)
                  ? 'hover:bg-accent hover:text-accent-foreground'
                  : 'text-muted-foreground/45 hover:bg-accent/60',
              isToday(day) && !(selectedDate && isSameDay(day, selectedDate)) && 'font-semibold text-primary',
            ]"
            @click="choose(day)"
          >
            {{ format(day, 'd') }}
            <span v-if="isToday(day)" class="absolute bottom-1 h-0.5 w-3" :class="selectedDate && isSameDay(day, selectedDate) ? 'bg-primary-foreground' : 'bg-primary'" />
          </button>
        </div>

        <div v-if="presets || clearable" class="mt-3 flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
          <template v-if="presets">
            <button
              v-for="preset in PRESETS"
              :key="preset.label"
              type="button"
              class="border border-border/80 px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
              :disabled="isBeforeMin(addDays(new Date(), preset.days))"
              @click="choose(addDays(new Date(), preset.days))"
            >
              {{ preset.label }}
            </button>
          </template>
          <button
            v-if="clearable && model"
            type="button"
            class="ml-auto px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            @click="commit('')"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
