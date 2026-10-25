<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Custom numeric field with stepper buttons. The model is a string (empty = no value),
 * matching how form state is kept; `commit` fires on blur, Enter and every step.
 */
const props = withDefaults(
  defineProps<{
    min?: number
    max?: number
    step?: number
    placeholder?: string
    disabled?: boolean
    size?: 'default' | 'sm'
    suffix?: string
    id?: string
    ariaLabel?: string
    class?: string
  }>(),
  { step: 1, size: 'default' },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ commit: [value: string] }>()

const text = ref('')
watch(model, (value) => (text.value = value ?? ''), { immediate: true })

const numeric = computed(() => (text.value === '' ? null : Number(text.value)))
const clamp = (value: number) => Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, value))

function write(value: string) {
  text.value = value
  model.value = value
}

function onInput(event: Event) {
  const allowNegative = (props.min ?? 0) < 0
  const raw = (event.target as HTMLInputElement).value
  const cleaned = raw.replace(allowNegative ? /[^\d-]/g : /\D/g, '').replace(/(?!^)-/g, '')
  ;(event.target as HTMLInputElement).value = cleaned
  write(cleaned)
}

function normalize() {
  if (text.value === '' || text.value === '-') return write('')
  write(String(clamp(Number(text.value))))
}

function commit() {
  normalize()
  emit('commit', text.value)
}

function stepBy(direction: 1 | -1) {
  const base = numeric.value ?? (direction > 0 ? (props.min ?? 0) - props.step : (props.min ?? 0) + props.step)
  write(String(clamp(base + direction * props.step)))
  emit('commit', text.value)
}

const atMin = computed(() => numeric.value !== null && props.min !== undefined && numeric.value <= props.min)
const atMax = computed(() => numeric.value !== null && props.max !== undefined && numeric.value >= props.max)
</script>

<template>
  <div
    :class="
      cn(
        'group flex w-full items-stretch border border-input bg-card/70 shadow-xs transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15 hover:border-primary/40 dark:bg-card/40',
        size === 'sm' ? 'h-8' : 'h-9',
        disabled && 'pointer-events-none opacity-50',
        props.class,
      )
    "
  >
    <button
      type="button"
      tabindex="-1"
      class="flex w-8 shrink-0 items-center justify-center border-r border-input text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
      :disabled="disabled || atMin"
      aria-label="Decrease"
      @click="stepBy(-1)"
    >
      <Minus class="size-3.5" />
    </button>
    <input
      :id="id"
      :value="text"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="ariaLabel"
      role="spinbutton"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="numeric ?? undefined"
      class="w-0 min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground/80"
      @input="onInput"
      @blur="commit"
      @keydown.enter.prevent="commit"
      @keydown.up.prevent="stepBy(1)"
      @keydown.down.prevent="stepBy(-1)"
    />
    <span v-if="suffix" class="flex items-center pr-2 text-xs text-muted-foreground">{{ suffix }}</span>
    <button
      type="button"
      tabindex="-1"
      class="flex w-8 shrink-0 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
      :disabled="disabled || atMax"
      aria-label="Increase"
      @click="stepBy(1)"
    >
      <Plus class="size-3.5" />
    </button>
  </div>
</template>
