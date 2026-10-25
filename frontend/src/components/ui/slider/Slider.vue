<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SliderRange, SliderRoot, type SliderRootEmits, type SliderRootProps, SliderThumb, SliderTrack, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class']; thumbLabel?: string }>()
const emits = defineEmits<SliderRootEmits>()
const forwarded = useForwardPropsEmits(reactiveOmit(props, 'class', 'thumbLabel'), emits)
</script>

<template>
  <SliderRoot
    data-slot="slider"
    v-bind="forwarded"
    :class="cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50', props.class)"
  >
    <SliderTrack class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-input">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, index) in modelValue ?? defaultValue ?? [0]"
      :key="index"
      :aria-label="thumbLabel"
      class="block size-4 cursor-grab rounded-full border-2 border-primary bg-card shadow-soft transition-[box-shadow] outline-none hover:ring-4 hover:ring-ring/15 focus-visible:ring-4 focus-visible:ring-ring/25 active:cursor-grabbing"
    />
  </SliderRoot>
</template>
