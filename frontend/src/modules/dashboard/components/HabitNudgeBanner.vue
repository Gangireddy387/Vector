<script setup lang="ts">
import { Play, Sunrise, X } from 'lucide-vue-next'
import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Toolbar from '@/components/common/Toolbar.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { HabitNudge } from '../dashboard.api'

const props = defineProps<{ nudge: HabitNudge }>()
const auth = useAuthStore()
const dismissed = useStorage<Record<string, string>>('vector.habitNudge.dismissed', {})
const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}.${props.nudge.day}`)
const visible = computed(() => dismissed.value[scope.value] !== props.nudge.title)

const reasonLabel: Record<string, string> = {
  standup: 'standup still open',
  overdue: 'overdue tasks',
  dueToday: 'due today',
}

const detail = computed(() => (props.nudge.reasons ?? []).map((reason) => reasonLabel[reason] ?? reason).join(' · '))

const ctaTo = computed(() => {
  const first = props.nudge.standupPending?.[0]
  if (first) return { name: 'project-standup' as const, params: { projectId: first.projectId }, query: { date: first.date } }
  return { name: 'home' as const, query: { startDay: '1' } }
})

function dismiss() {
  dismissed.value = { ...dismissed.value, [scope.value]: props.nudge.title }
}
</script>

<template>
  <section
    v-if="visible"
    class="overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3 shadow-soft"
    :aria-label="nudge.title"
  >
    <Toolbar justify="between" align="center">
      <template #start>
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Sunrise class="size-4" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold">{{ nudge.title }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Habit check: {{ detail }}. Run the loop — standup → tasks → meetings → messages.
          </p>
        </div>
      </template>
      <template #end>
        <Button size="sm" class="max-sm:min-w-0 max-sm:flex-1" as-child>
          <RouterLink :to="ctaTo"><Play /> Start my day</RouterLink>
        </Button>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Dismiss" @click="dismiss"><X /></Button>
      </template>
    </Toolbar>
  </section>
</template>
