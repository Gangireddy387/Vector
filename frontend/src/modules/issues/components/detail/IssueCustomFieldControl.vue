<script setup lang="ts">
import { DatePicker, SelectField } from '@/components/forms'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { CustomField, CustomFieldValue } from '@/types/models'

const props = defineProps<{
  field: CustomField
  value: CustomFieldValue
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:value': [value: CustomFieldValue]
}>()

function onTextBlur(event: Event) {
  emit('update:value', (event.target as HTMLInputElement).value.trim() || null)
}

function onNumberBlur(event: Event) {
  const text = (event.target as HTMLInputElement).value.trim()
  emit('update:value', text === '' ? null : Number(text))
}

function blurOnEnter(event: Event) {
  ;(event.target as HTMLInputElement).blur()
}

function toggleMulti(option: string, on: boolean) {
  const current = Array.isArray(props.value) ? [...props.value] : []
  const next = on ? [...new Set([...current, option])] : current.filter((item) => item !== option)
  emit('update:value', next.length ? next : null)
}
</script>

<template>
  <Input
    v-if="field.type === 'text' || field.type === 'url'"
    :id="`cf-${field.id}`"
    :model-value="typeof value === 'string' ? value : ''"
    class="h-8"
    :type="field.type === 'url' ? 'url' : 'text'"
    :placeholder="field.type === 'url' ? 'https://…' : '–'"
    :disabled="disabled"
    @blur="onTextBlur"
    @keydown.enter="blurOnEnter"
  />
  <Input
    v-else-if="field.type === 'number'"
    :id="`cf-${field.id}`"
    type="number"
    class="h-8"
    :model-value="value == null ? '' : String(value)"
    placeholder="–"
    :disabled="disabled"
    @blur="onNumberBlur"
    @keydown.enter="blurOnEnter"
  />
  <DatePicker
    v-else-if="field.type === 'date'"
    :id="`cf-${field.id}`"
    :model-value="typeof value === 'string' ? value : ''"
    size="sm"
    placeholder="None"
    :disabled="disabled"
    @update:model-value="(next) => emit('update:value', next || null)"
  />
  <SelectField
    v-else-if="field.type === 'select'"
    :id="`cf-${field.id}`"
    :model-value="typeof value === 'string' ? value : ''"
    :options="[{ value: '', label: 'None' }, ...field.options.map((option) => ({ value: option, label: option }))]"
    size="sm"
    :disabled="disabled"
    @update:model-value="(next) => emit('update:value', next || null)"
  />
  <div v-else-if="field.type === 'multi_select'" class="flex w-full flex-col gap-1.5">
    <label v-for="option in field.options" :key="option" class="flex items-center gap-2 text-sm">
      <Checkbox
        :model-value="Array.isArray(value) && value.includes(option)"
        :disabled="disabled"
        @update:model-value="(next) => toggleMulti(option, next === true)"
      />
      {{ option }}
    </label>
  </div>
  <Checkbox
    v-else-if="field.type === 'checkbox'"
    :id="`cf-${field.id}`"
    :model-value="Boolean(value)"
    :disabled="disabled"
    @update:model-value="(next) => emit('update:value', next === true)"
  />
</template>
