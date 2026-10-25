<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FilterOption {
  value: string
  label: string
  color?: string
}

/** Multi-select filter whose value is a comma-separated string (matches the API query format). */
const props = defineProps<{ label: string; options: FilterOption[] }>()
const model = defineModel<string | undefined>()

const selected = computed(() => (model.value ? model.value.split(',').filter(Boolean) : []))
const summary = computed(() => {
  if (!selected.value.length) return props.label
  if (selected.value.length === 1) return props.options.find((option) => option.value === selected.value[0])?.label ?? props.label
  return `${props.label} · ${selected.value.length}`
})

function toggle(value: string) {
  const next = selected.value.includes(value) ? selected.value.filter((item) => item !== value) : [...selected.value, value]
  model.value = next.length ? next.join(',') : undefined
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" :class="selected.length ? 'border-primary/50 bg-primary/5 text-primary' : ''">
        {{ summary }} <ChevronDown class="opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="max-h-80 w-56">
      <DropdownMenuLabel>{{ label }}</DropdownMenuLabel>
      <DropdownMenuCheckboxItem
        v-for="option in options"
        :key="option.value"
        :model-value="selected.includes(option.value)"
        @select.prevent="toggle(option.value)"
      >
        <span v-if="option.color" class="size-2 rounded-full" :style="{ backgroundColor: option.color }" />
        {{ option.label }}
      </DropdownMenuCheckboxItem>
      <template v-if="selected.length">
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="model = undefined">Clear</DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
