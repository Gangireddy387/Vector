<script setup lang="ts">
import { computed } from 'vue'

export interface BarItem {
  label: string
  value: number
  color?: string
  hint?: string
}

const props = defineProps<{ items: BarItem[]; emptyText?: string }>()
const max = computed(() => Math.max(1, ...props.items.map((item) => item.value)))
</script>

<template>
  <ul v-if="items.length" class="space-y-3">
    <li v-for="item in items" :key="item.label" class="space-y-1">
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="flex min-w-0 items-center gap-2">
          <slot name="label" :item="item">
            <span class="truncate">{{ item.label }}</span>
          </slot>
        </span>
        <span class="shrink-0 tabular-nums text-muted-foreground">
          {{ item.value }}<span v-if="item.hint" class="ml-1 text-xs">{{ item.hint }}</span>
        </span>
      </div>
      <div class="h-2 overflow-hidden bg-muted">
        <div
          class="h-full transition-[width] duration-500"
          :style="{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color ?? 'var(--primary)' }"
        />
      </div>
    </li>
  </ul>
  <p v-else class="py-6 text-center text-sm text-muted-foreground">{{ emptyText ?? 'No data yet' }}</p>
</template>
