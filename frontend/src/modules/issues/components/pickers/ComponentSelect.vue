<script setup lang="ts">
import { Boxes } from 'lucide-vue-next'
import { computed } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import type { Component } from '@/types/models'

const props = withDefaults(defineProps<{ components: Component[]; size?: 'sm' | 'default'; disabled?: boolean; id?: string }>(), {
  size: 'default',
})
const model = defineModel<string | null>({ default: null })

const options = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'No component', icon: Boxes },
  ...props.components.map((component) => ({
    value: component.id,
    label: component.name,
    color: component.color,
    description: component.description ?? undefined,
    icon: Boxes,
  })),
])
</script>

<template>
  <SelectField :id="id" v-model="model" :options="options" :size="size" :disabled="disabled" placeholder="Component…" aria-label="Component" />
</template>
