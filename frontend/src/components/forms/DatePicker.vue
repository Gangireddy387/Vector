<script setup lang="ts">
import {
  addDays,
  addMonths,
  endOfQuarter,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDevice } from '@/composables/useDevice'
import { toDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type FieldSize, fieldPanelClass, fieldTriggerVariants } from './field-styles'

/**
 * Shared date field for the whole app.
 * Value is local `YYYY-MM-DD`; empty string means “no date”.
 * Phone: bottom sheet. Tablet/desktop: anchored popover.
 */
const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    presets?: boolean
    /** Extra presets for quarter planning (goals / OKRs). */
    periodPresets?: boolean
    size?: FieldSize
    id?: string
    ariaLabel?: string
    displayFormat?: string
    class?: string
    /** Earliest selectable day (`YYYY-MM-DD`). */
    min?: string
    /** Latest selectable day (`YYYY-MM-DD`). */
    max?: string
  }>(),
  {
    placeholder: 'Pick a date',
    clearable: true,
    presets: true,
    periodPresets: false,
    size: 'default',
    displayFormat: 'dd/MM/yyyy',
  },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ change: [value: string] }>()

const { isPhone } = useDevice()
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
const isAfterMax = (day: Date) => Boolean(props.max) && toDateInput(day) > props.max!
const isDisabledDay = (day: Date) => isBeforeMin(day) || isAfterMax(day)

const choose = (day: Date) => {
  if (!isDisabledDay(day)) commit(toDateInput(day))
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
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose(focusedDay.value)
  }
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  void nextTick(() => grid.value?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus())
}

const quickPresets = computed(() => {
  const today = new Date()
  const items: Array<{ label: string; date: Date }> = []
  if (props.presets) {
    items.push(
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: addDays(today, 1) },
      { label: 'Next week', date: addDays(today, 7) },
    )
  }
  if (props.periodPresets) {
    items.push(
      { label: 'Quarter start', date: startOfQuarter(today) },
      { label: 'Quarter end', date: endOfQuarter(today) },
    )
  }
  return items
})

const dayButtonClass = (day: Date) => {
  const selected = selectedDate.value && isSameDay(day, selectedDate.value)
  const disabled = isDisabledDay(day)
  return [
    selected
      ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
      : disabled
        ? 'cursor-not-allowed text-muted-foreground/35 line-through decoration-muted-foreground/30'
        : isSameMonth(day, viewMonth.value)
          ? 'hover:bg-accent hover:text-accent-foreground active:bg-accent'
          : 'text-muted-foreground/45 hover:bg-accent/60',
    isToday(day) && !selected && 'font-semibold text-primary',
  ]
}
</script>

<template>
  <!-- Phone: bottom sheet calendar -->
  <template v-if="isPhone">
    <button
      :id="id"
      type="button"
      :aria-label="ariaLabel ?? (selectedDate ? `Date: ${label}` : placeholder)"
      :disabled="disabled"
      :data-state="open ? 'open' : 'closed'"
      :class="cn(fieldTriggerVariants({ size }), 'min-h-10 touch-manipulation', props.class)"
      @click="open = true"
    >
      <CalendarDays class="size-4 shrink-0" :class="selectedDate ? 'text-primary' : 'text-muted-foreground'" />
      <span class="min-w-0 flex-1 truncate" :class="!selectedDate && 'text-muted-foreground'">{{ label }}</span>
      <button
        v-if="clearable && model && !disabled"
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Clear date"
        @click.stop="commit('')"
      >
        <X class="size-3.5" />
      </button>
    </button>

    <Sheet :open="open" @update:open="(value: boolean) => (open = value)">
      <SheetContent side="bottom" class="gap-0 p-0 pb-safe" hide-close>
        <SheetHeader class="border-b px-4 py-3 text-left">
          <SheetTitle class="text-base">{{ ariaLabel || placeholder }}</SheetTitle>
        </SheetHeader>
        <div class="px-4 pb-4 pt-3">
          <div class="mb-3 flex items-center justify-between">
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
              :aria-selected="selectedDate ? isSameDay(day, selectedDate) : false"
              :aria-disabled="isDisabledDay(day) || undefined"
              @click="choose(day)"
            >
              {{ format(day, 'd') }}
              <span
                v-if="isToday(day)"
                class="absolute bottom-1.5 h-0.5 w-3 rounded-full"
                :class="selectedDate && isSameDay(day, selectedDate) ? 'bg-primary-foreground' : 'bg-primary'"
              />
            </button>
          </div>

          <div v-if="quickPresets.length || clearable" class="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">
            <Button
              v-for="preset in quickPresets"
              :key="preset.label"
              type="button"
              variant="outline"
              size="sm"
              class="touch-manipulation"
              :disabled="isDisabledDay(preset.date)"
              @click="choose(preset.date)"
            >
              {{ preset.label }}
            </Button>
            <Button
              v-if="clearable && model"
              type="button"
              variant="ghost"
              size="sm"
              class="ml-auto text-muted-foreground"
              @click="commit('')"
            >
              Clear
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </template>

  <!-- Tablet / desktop: popover calendar -->
  <PopoverRoot v-else v-model:open="open">
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
        <span class="min-w-0 flex-1 truncate" :class="!selectedDate && 'text-muted-foreground'">{{ label }}</span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="4"
        :collision-padding="12"
        :class="cn(fieldPanelClass, 'w-[19rem] p-3')"
        @open-auto-focus="onOpenAutoFocus"
      >
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
            :aria-selected="selectedDate ? isSameDay(day, selectedDate) : false"
            :aria-disabled="isDisabledDay(day) || undefined"
            :aria-label="format(day, 'EEEE, d MMMM yyyy')"
            class="relative flex h-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            :class="dayButtonClass(day)"
            @click="choose(day)"
          >
            {{ format(day, 'd') }}
            <span
              v-if="isToday(day)"
              class="absolute bottom-1 h-0.5 w-3 rounded-full"
              :class="selectedDate && isSameDay(day, selectedDate) ? 'bg-primary-foreground' : 'bg-primary'"
            />
          </button>
        </div>

        <div v-if="quickPresets.length || clearable" class="mt-3 flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
          <button
            v-for="preset in quickPresets"
            :key="preset.label"
            type="button"
            class="rounded-md border border-border/80 px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
            :disabled="isDisabledDay(preset.date)"
            @click="choose(preset.date)"
          >
            {{ preset.label }}
          </button>
          <button
            v-if="clearable && model"
            type="button"
            class="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            @click="commit('')"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
