<script setup lang="ts">
import { useOnline } from '@vueuse/core'
import { RefreshCw, WifiOff } from 'lucide-vue-next'
import { watch } from 'vue'
import { Button } from '@/components/ui/button'
import { requestCriticalRetry } from '@/lib/pwa-caches'

const online = useOnline()
const emit = defineEmits<{ online: []; offline: [] }>()

watch(
  online,
  (value, wasOnline) => {
    if (value) {
      emit('online')
      // Coming back online: refresh Home / Inbox / shell data once.
      if (wasOnline === false) requestCriticalRetry()
    } else {
      emit('offline')
    }
  },
  { immediate: true },
)

function retry() {
  requestCriticalRetry()
}
</script>

<template>
  <div
    v-if="!online"
    class="flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-xs font-medium text-amber-950 dark:text-amber-100"
    role="status"
  >
    <WifiOff class="size-3.5 shrink-0" />
    <span class="min-w-0">You’re offline — showing last loaded data when available. Edits may not save.</span>
    <Button
      type="button"
      size="xs"
      variant="outline"
      class="h-7 shrink-0 gap-1 border-amber-700/30 bg-background/80 text-amber-950 hover:bg-background dark:text-amber-50"
      @click="retry"
    >
      <RefreshCw class="size-3.5" /> Retry
    </Button>
  </div>
</template>
