<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  defaultValue?: string
  modelValue?: string | null
}>()

const emits = defineEmits<{ (event: 'update:modelValue', payload: string): void }>()

const modelValue = useVModel(props, 'modelValue', emits, { passive: true, defaultValue: props.defaultValue })
</script>

<template>
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :class="
      cn(
        'flex field-sizing-content min-h-16 w-full border border-input bg-card/70 px-3 py-2 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/80 hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-card/40',
        'focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/15',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        props.class,
      )
    "
  />
</template>
