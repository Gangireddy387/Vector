<script setup lang="ts">
import { computed } from 'vue'
import { PRIORITY_META } from '@/constants/issue'
import type { IssuePriority } from '@/types/models'

const props = withDefaults(defineProps<{ priority: IssuePriority; showLabel?: boolean }>(), { showLabel: false })
const meta = computed(() => PRIORITY_META[props.priority])
</script>

<template>
  <span class="inline-flex items-center gap-1.5" :title="`${meta.label} priority`">
    <component :is="meta.icon" class="size-4 shrink-0" :style="{ color: meta.color }" stroke-width="2.5" :aria-label="`${meta.label} priority`" />
    <span v-if="showLabel" class="text-sm">{{ meta.label }}</span>
  </span>
</template>
