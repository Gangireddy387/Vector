<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { ref, watch } from 'vue'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import { cn } from '@/lib/utils'
import { type FieldSize, fieldPanelClass, fieldTriggerVariants } from './field-styles'

/** Custom colour field: preset swatches plus a validated hex input. */
const props = withDefaults(
  defineProps<{ disabled?: boolean; size?: FieldSize; ariaLabel?: string; compact?: boolean; class?: string }>(),
  { size: 'default', compact: false },
)
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ change: [value: string] }>()

const open = ref(false)
const hex = ref(model.value)
watch(model, (value) => (hex.value = value))

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

function apply(value: string) {
  if (!HEX_PATTERN.test(value) || value === model.value) return
  model.value = value
  emit('change', value)
}

function pick(value: string) {
  apply(value)
  open.value = false
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="ariaLabel ?? `Colour ${model}`"
        :data-state="open ? 'open' : 'closed'"
        :class="cn(fieldTriggerVariants({ size }), compact ? 'w-auto px-1.5' : '', props.class)"
      >
        <span class="size-5 shrink-0 border border-black/10" :style="{ backgroundColor: model }" />
        <span v-if="!compact" class="font-mono text-xs uppercase">{{ model }}</span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent align="start" :side-offset="4" :class="cn(fieldPanelClass, 'w-64 space-y-3 p-3')">
        <ColorSwatchPicker :model-value="model" @update:model-value="pick" />
        <div class="flex items-center gap-2">
          <span class="size-8 shrink-0 border border-black/10" :style="{ backgroundColor: HEX_PATTERN.test(hex) ? hex : model }" />
          <input
            v-model="hex"
            maxlength="7"
            spellcheck="false"
            aria-label="Hex colour"
            class="h-8 min-w-0 flex-1 border border-input bg-transparent px-2 font-mono text-sm uppercase outline-none focus:border-primary"
            :class="!HEX_PATTERN.test(hex) && 'border-destructive'"
            @keydown.enter.prevent="pick(hex)"
            @blur="apply(hex)"
          />
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
