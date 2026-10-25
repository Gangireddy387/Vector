<script setup lang="ts">
import { computed } from 'vue'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

const props = withDefaults(defineProps<{ segments: DonutSegment[]; centerLabel?: string; centerValue?: string | number; size?: number }>(), {
  size: 160,
})

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0))

const arcs = computed(() => {
  let offset = 0
  return props.segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const length = (segment.value / total.value) * CIRCUMFERENCE
      const arc = { ...segment, dash: `${length} ${CIRCUMFERENCE - length}`, offset: -offset }
      offset += length
      return arc
    })
})
</script>

<template>
  <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
    <svg :width="size" :height="size" viewBox="0 0 100 100" class="shrink-0 -rotate-90" role="img" :aria-label="centerLabel">
      <circle cx="50" cy="50" :r="RADIUS" fill="none" stroke="var(--muted)" stroke-width="12" />
      <circle
        v-for="arc in arcs"
        :key="arc.label"
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        :style="{ stroke: arc.color }"
        stroke-width="12"
        :stroke-dasharray="arc.dash"
        :stroke-dashoffset="arc.offset"
      >
        <title>{{ arc.label }}: {{ arc.value }}</title>
      </circle>
      <g class="rotate-90" style="transform-origin: 50px 50px">
        <text x="50" y="49" text-anchor="middle" class="fill-foreground text-[16px] font-semibold">{{ centerValue ?? total }}</text>
        <text v-if="centerLabel" x="50" y="62" text-anchor="middle" class="fill-muted-foreground text-[7px]">{{ centerLabel }}</text>
      </g>
    </svg>
    <ul class="grid w-full gap-1.5 text-sm">
      <li v-for="segment in segments" :key="segment.label" class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-2">
          <span class="size-2.5" :style="{ backgroundColor: segment.color }" />
          {{ segment.label }}
        </span>
        <span class="tabular-nums text-muted-foreground">{{ segment.value }}</span>
      </li>
    </ul>
  </div>
</template>
