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
        'flex field-sizing-content min-h-16 w-full border border-border bg-card px-3 py-2 text-base shadow-soft transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/70 hover:border-input disabled:cursor-not-allowed disabled:opacity-50 md:text-[13px]',
        'focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        props.class,
      )
    "
  />
</template>
