<script setup lang="ts">
import { useOnline } from '@vueuse/core'
import { WifiOff } from 'lucide-vue-next'
import { watch } from 'vue'

const online = useOnline()
const emit = defineEmits<{ online: []; offline: [] }>()

watch(
  online,
  (value) => {
    if (value) emit('online')
    else emit('offline')
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="!online"
    class="flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-xs font-medium text-amber-950 dark:text-amber-100"
    role="status"
  >
    <WifiOff class="size-3.5 shrink-0" />
    You’re offline — edits may not save until you reconnect.
  </div>
</template>
