<script setup lang="ts">
import { Square, Timer } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useTimerStore } from '@/stores/timer.store'

const auth = useAuthStore()
const timers = useTimerStore()
const openIssue = useOpenIssue()
const router = useRouter()

const visible = computed(() => auth.hasFeature('timeTracking') && timers.isRunning)

function openTimedIssue() {
  const issue = timers.timer?.issue
  if (!issue) return
  if (issue.key) openIssue({ key: issue.key })
  else void router.push({ name: 'project-board', params: { projectId: issue.projectId } })
}
</script>

<template>
  <div
    v-if="visible"
    class="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
  >
    <button
      type="button"
      class="inline-flex max-w-[9rem] items-center gap-1 truncate hover:underline sm:max-w-[14rem]"
      :title="timers.timer?.issue?.title ?? 'Running timer'"
      @click="openTimedIssue"
    >
      <Timer class="size-3.5 shrink-0 animate-pulse" />
      <span class="truncate font-mono">{{ timers.timer?.issue?.key }}</span>
      <span class="tabular-nums">{{ timers.elapsedLabel }}</span>
    </button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-6 text-primary hover:bg-primary/15"
      :loading="timers.acting"
      aria-label="Stop timer"
      @click="timers.stop()"
    >
      <Square class="size-3 fill-current" />
    </Button>
  </div>
</template>
