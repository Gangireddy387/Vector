<script setup lang="ts">
import { CalendarRange } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { DatePicker, SelectField, type SelectFieldOption } from '@/components/forms'
import { PERIOD_PRESETS, type Period, type PeriodPreset, presetRange } from '../period'

const period = defineModel<Period>({ required: true })

const options: SelectFieldOption[] = [...PERIOD_PRESETS, { value: 'custom', label: 'Custom range…' }].map((preset) => ({
  value: preset.value,
  label: preset.label,
  icon: CalendarRange,
}))

const customMode = ref(false)
const preset = computed(() => {
  if (customMode.value) return 'custom'
  const match = PERIOD_PRESETS.find((option) => {
    const range = presetRange(option.value)
    return range.from === period.value.from && range.to === period.value.to
  })
  return match?.value ?? 'custom'
})

function choose(value?: string | null) {
  if (!value) return
  customMode.value = value === 'custom'
  if (value !== 'custom') period.value = presetRange(value as PeriodPreset)
}

function setDate(key: keyof Period, value: string) {
  if (!value) return
  const next = { ...period.value, [key]: value }
  if (next.from > next.to) {
    if (key === 'from') next.to = value
    else next.from = value
  }
  period.value = next
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <SelectField :model-value="preset" :options="options" size="sm" class="w-44" aria-label="Review period" @update:model-value="choose" />
    <template v-if="preset === 'custom'">
      <DatePicker :model-value="period.from" size="sm" class="w-40" :clearable="false" display-format="d MMM yyyy" aria-label="From" @update:model-value="(value) => setDate('from', value)" />
      <span class="text-xs text-muted-foreground">to</span>
      <DatePicker :model-value="period.to" size="sm" class="w-40" :clearable="false" display-format="d MMM yyyy" aria-label="To" @update:model-value="(value) => setDate('to', value)" />
    </template>
  </div>
</template>
