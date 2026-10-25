<script setup lang="ts">
import { computed, ref } from 'vue'

export interface LineSeries {
  name: string
  color: string
  values: Array<number | null>
  dashed?: boolean
  area?: boolean
}

const props = withDefaults(defineProps<{ labels: string[]; series: LineSeries[]; height?: number; tooltipLabels?: string[] }>(), {
  height: 220,
})

const WIDTH = 640
const PADDING = { top: 12, right: 12, bottom: 28, left: 32 }

const GRID_STEPS = 4
const dataMax = computed(() => Math.max(1, ...props.series.flatMap((serie) => serie.values.filter((value): value is number => value !== null))))
/** Rounded up so every grid line lands on a whole number (no duplicate axis labels). */
const maxValue = computed(() => Math.ceil(dataMax.value / GRID_STEPS) * GRID_STEPS)
const innerWidth = WIDTH - PADDING.left - PADDING.right
const innerHeight = computed(() => props.height - PADDING.top - PADDING.bottom)

const x = (index: number) => PADDING.left + (props.labels.length <= 1 ? 0 : (index / (props.labels.length - 1)) * innerWidth)
const y = (value: number) => PADDING.top + innerHeight.value - (value / maxValue.value) * innerHeight.value

const paths = computed(() =>
  props.series.map((serie) => {
    const points = serie.values
      .map((value, index) => (value === null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`))
      .filter(Boolean) as string[]
    const line = points.length ? `M${points.join(' L')}` : ''
    const lastIndex = serie.values.reduce<number>((last, value, index) => (value === null ? last : index), 0)
    const area = serie.area && points.length ? `${line} L${x(lastIndex).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
    return { ...serie, line, area }
  }),
)

const gridLines = computed(() =>
  Array.from({ length: GRID_STEPS + 1 }, (_, step) => {
    const value = (maxValue.value / GRID_STEPS) * step
    return { y: y(value), value }
  }),
)
const tickEvery = computed(() => Math.max(1, Math.ceil(props.labels.length / 7)))

/** Hover read-out: nearest point under the pointer. */
const svgRef = ref<SVGSVGElement | null>(null)
const hoverIndex = ref<number | null>(null)
function onPointerMove(event: PointerEvent) {
  const svg = svgRef.value
  if (!svg || props.labels.length < 1) return
  const rect = svg.getBoundingClientRect()
  const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
  const ratio = (svgX - PADDING.left) / innerWidth
  hoverIndex.value = Math.min(props.labels.length - 1, Math.max(0, Math.round(ratio * (props.labels.length - 1))))
}
const hoverLeftPercent = computed(() => (hoverIndex.value === null ? 0 : (x(hoverIndex.value) / WIDTH) * 100))
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${WIDTH} ${height}`"
        class="h-auto w-full touch-none"
        role="img"
        @pointermove="onPointerMove"
        @pointerleave="hoverIndex = null"
      >
        <g v-for="grid in gridLines" :key="grid.y">
          <line :x1="PADDING.left" :x2="WIDTH - PADDING.right" :y1="grid.y" :y2="grid.y" stroke="var(--border)" stroke-dasharray="3 3" />
          <text :x="PADDING.left - 6" :y="grid.y + 3" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ grid.value }}</text>
        </g>
        <template v-for="(label, index) in labels" :key="`${label}-${index}`">
          <text v-if="index % tickEvery === 0" :x="x(index)" :y="height - 8" text-anchor="middle" class="fill-muted-foreground text-[10px]">
            {{ label }}
          </text>
        </template>
        <g v-for="path in paths" :key="path.name">
          <path v-if="path.area" :d="path.area" :style="{ fill: path.color }" fill-opacity="0.08" />
          <path
            :d="path.line"
            fill="none"
            :style="{ stroke: path.color }"
            stroke-width="2.25"
            stroke-linejoin="round"
            stroke-linecap="round"
            :stroke-dasharray="path.dashed ? '6 5' : undefined"
          />
        </g>
        <g v-if="hoverIndex !== null">
          <line :x1="x(hoverIndex)" :x2="x(hoverIndex)" :y1="PADDING.top" :y2="PADDING.top + innerHeight" stroke="var(--muted-foreground)" stroke-opacity="0.4" />
          <template v-for="serie in series" :key="serie.name">
            <circle
              v-if="serie.values[hoverIndex] !== null && serie.values[hoverIndex] !== undefined"
              :cx="x(hoverIndex)"
              :cy="y(serie.values[hoverIndex]!)"
              r="4"
              :style="{ fill: serie.color }"
              stroke="var(--card)"
              stroke-width="2"
            />
          </template>
        </g>
      </svg>
      <div
        v-if="hoverIndex !== null"
        class="pointer-events-none absolute top-1 z-10 min-w-36 border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-elevated"
        :style="{ left: `${hoverLeftPercent}%`, transform: hoverLeftPercent > 60 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }"
      >
        <p class="mb-1 font-semibold">{{ tooltipLabels?.[hoverIndex] ?? labels[hoverIndex] }}</p>
        <p v-for="serie in series" :key="serie.name" class="flex items-center justify-between gap-4">
          <span class="flex items-center gap-1.5 text-muted-foreground"><span class="size-2" :style="{ backgroundColor: serie.color }" />{{ serie.name }}</span>
          <span class="font-medium tabular-nums">{{ serie.values[hoverIndex] ?? '—' }}</span>
        </p>
      </div>
    </div>
    <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span v-for="serie in series" :key="serie.name" class="flex items-center gap-1.5">
        <span class="h-0.5 w-4" :style="{ backgroundColor: serie.color }" />
        {{ serie.name }}
      </span>
    </div>
  </div>
</template>
