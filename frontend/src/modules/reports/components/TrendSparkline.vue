<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ values: number[]; width?: number; height?: number; label?: string }>(), { width: 72, height: 22 })

const points = computed(() => {
  const max = Math.max(1, ...props.values)
  const step = props.values.length > 1 ? props.width / (props.values.length - 1) : 0
  return props.values.map((value, index) => [index * step, props.height - 2 - (value / max) * (props.height - 4)] as const)
})
const line = computed(() => points.value.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '))
const area = computed(() => (points.value.length ? `0,${props.height} ${line.value} ${props.width},${props.height}` : ''))
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" class="overflow-visible" role="img" :aria-label="label ?? `Trend: ${values.join(', ')}`">
    <template v-if="values.length > 1">
      <polygon :points="area" class="fill-primary/12" />
      <polyline :points="line" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    </template>
  </svg>
</template>
