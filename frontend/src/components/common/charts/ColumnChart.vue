<script setup lang="ts">
import { computed } from 'vue'

export interface ColumnSeries {
  name: string
  color: string
  values: number[]
}

const props = withDefaults(defineProps<{ labels: string[]; series: ColumnSeries[]; height?: number }>(), { height: 220 })

const WIDTH = 640
const PADDING = { top: 12, right: 8, bottom: 32, left: 32 }
const innerWidth = WIDTH - PADDING.left - PADDING.right
const innerHeight = computed(() => props.height - PADDING.top - PADDING.bottom)
const maxValue = computed(() => Math.max(1, ...props.series.flatMap((serie) => serie.values)))

const groupWidth = computed(() => innerWidth / Math.max(1, props.labels.length))
const barWidth = computed(() => Math.min(28, (groupWidth.value * 0.7) / Math.max(1, props.series.length)))

const bars = computed(() =>
  props.labels.flatMap((label, groupIndex) =>
    props.series.map((serie, serieIndex) => {
      const value = serie.values[groupIndex] ?? 0
      const barHeight = (value / maxValue.value) * innerHeight.value
      const groupStart = PADDING.left + groupIndex * groupWidth.value
      const offset = (groupWidth.value - barWidth.value * props.series.length) / 2
      return {
        key: `${label}-${serie.name}`,
        x: groupStart + offset + serieIndex * barWidth.value,
        y: PADDING.top + innerHeight.value - barHeight,
        height: barHeight,
        color: serie.color,
        title: `${serie.name} · ${label}: ${value}`,
      }
    }),
  ),
)
</script>

<template>
  <div class="space-y-3">
    <svg :viewBox="`0 0 ${WIDTH} ${height}`" class="h-auto w-full" role="img">
      <line :x1="PADDING.left" :x2="WIDTH - PADDING.right" :y1="PADDING.top + innerHeight" :y2="PADDING.top + innerHeight" stroke="var(--border)" />
      <text :x="PADDING.left - 6" :y="PADDING.top + 4" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ maxValue }}</text>
      <rect v-for="bar in bars" :key="bar.key" :x="bar.x" :y="bar.y" :width="barWidth - 3" :height="bar.height" :style="{ fill: bar.color }">
        <title>{{ bar.title }}</title>
      </rect>
      <text
        v-for="(label, index) in labels"
        :key="label"
        :x="PADDING.left + index * groupWidth + groupWidth / 2"
        :y="height - 10"
        text-anchor="middle"
        class="fill-muted-foreground text-[10px]"
      >
        {{ label.length > 14 ? `${label.slice(0, 13)}…` : label }}
      </text>
    </svg>
    <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span v-for="serie in series" :key="serie.name" class="flex items-center gap-1.5">
        <span class="size-2.5" :style="{ backgroundColor: serie.color }" />
        {{ serie.name }}
      </span>
    </div>
  </div>
</template>
