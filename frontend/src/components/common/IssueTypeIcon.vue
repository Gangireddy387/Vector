<script setup lang="ts">
import { computed } from 'vue'
import { ISSUE_TYPE_META } from '@/constants/issue'
import { cn } from '@/lib/utils'
import type { IssueType } from '@/types/models'

const props = withDefaults(defineProps<{ type: IssueType; size?: 'sm' | 'md'; class?: string }>(), { size: 'sm' })
const meta = computed(() => ISSUE_TYPE_META[props.type])
</script>

<template>
  <span
    :class="cn('inline-flex shrink-0 items-center justify-center text-white', size === 'sm' ? 'size-4' : 'size-5', props.class)"
    :style="{ backgroundColor: meta.color }"
    :title="meta.label"
    role="img"
    :aria-label="meta.label"
  >
    <component :is="meta.icon" :class="size === 'sm' ? 'size-2.5' : 'size-3'" stroke-width="3" />
  </span>
</template>
