<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { COLOR_SWATCHES } from '@/constants/issue'

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
    <button
      v-for="color in COLOR_SWATCHES"
      :key="color"
      type="button"
      role="radio"
      :aria-checked="model === color"
      :aria-label="color"
      class="flex size-6 items-center justify-center ring-offset-2 ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
      :class="model === color && 'ring-2 ring-foreground/40'"
      :style="{ backgroundColor: color }"
      @click="model = color"
    >
      <Check v-if="model === color" class="size-3.5 text-white" />
    </button>
  </div>
</template>
