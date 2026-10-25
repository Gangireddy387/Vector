<script setup lang="ts">
import { computed } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import type { Contributor } from '../reports.api'

const props = defineProps<{ contributors: Contributor[] }>()
const max = computed(() => Math.max(1, ...props.contributors.map((row) => row.total)))
</script>

<template>
  <ul v-if="contributors.length" class="space-y-2">
    <li v-for="row in contributors" :key="row.user.id" class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span class="flex min-w-0 items-center gap-2">
        <UserAvatar :user="row.user" size="xs" />
        <span class="truncate">{{ row.user.name }}</span>
      </span>
      <span class="flex h-2 bg-muted" :title="`${row.done} of ${row.total} done`">
        <span class="h-full bg-success transition-[width] duration-500" :style="{ width: `${(row.done / max) * 100}%` }" />
        <span class="h-full bg-primary/35 transition-[width] duration-500" :style="{ width: `${((row.total - row.done) / max) * 100}%` }" />
      </span>
      <span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <span class="font-semibold text-foreground">{{ row.done }}</span>/{{ row.total }} done<template v-if="row.donePoints"> · {{ row.donePoints }} pts</template>
      </span>
    </li>
  </ul>
  <p v-else class="text-sm text-muted-foreground">Nobody is assigned to this work yet.</p>
</template>
