<script setup lang="ts">
import { Clock } from 'lucide-vue-next'
import { computed } from 'vue'
import SelectField from './SelectField.vue'
import type { FieldSize } from './field-styles'
import type { SelectFieldOption } from './select-field.types'

/** Custom time field: 15-minute slots, searchable by typing "9:30" or "14". Value is `HH:mm`. */
const props = withDefaults(
  defineProps<{
    disabled?: boolean
    size?: FieldSize
    id?: string
    ariaLabel?: string
    class?: string
    placeholder?: string
    /** Earliest slot offered (`HH:mm`, inclusive); earlier slots are left out of the list. */
    min?: string
    emptyText?: string
  }>(),
  { size: 'default' },
)
const model = defineModel<string>({ required: true })

const pad = (value: number) => String(value).padStart(2, '0')
const toTwelveHour = (hour: number, minute: number) => `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`

const SLOTS: SelectFieldOption[] = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
  const minute = (index % 4) * 15
  return {
    value: `${pad(hour)}:${pad(minute)}`,
    label: `${pad(hour)}:${pad(minute)}`,
    description: toTwelveHour(hour, minute),
    icon: Clock,
    group: hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening',
  }
})

/** The current value stays listed (greyed out) even when it is earlier than `min`, so the field never looks empty. */
const options = computed(() =>
  props.min
    ? SLOTS.flatMap((slot) => (slot.value! >= props.min! ? [slot] : slot.value === model.value ? [{ ...slot, disabled: true }] : []))
    : SLOTS,
)
</script>

<template>
  <SelectField
    v-model="model"
    :options="options"
    searchable
    search-placeholder="Type a time, e.g. 9:30"
    :placeholder="placeholder"
    :empty-text="emptyText ?? 'No matching times'"
    :disabled="disabled"
    :size="size"
    :id="id"
    :aria-label="ariaLabel ?? 'Time'"
    :class="$props.class"
  />
</template>
