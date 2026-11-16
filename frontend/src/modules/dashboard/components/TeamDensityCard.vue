<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { UserPlus, UsersRound, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData }>()
const auth = useAuthStore()
const dismissed = useStorage<Record<string, string[]>>('vector.density.dismissed', {})
const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}`)
const dismissedIds = computed(() => new Set(dismissed.value[scope.value] ?? []))

const hints = computed(() => (props.data.densityHints ?? []).filter((hint) => !dismissedIds.value.has(hint.projectId)))
const show = computed(() => hints.value.length > 0)

function dismiss(projectId: string) {
  const current = dismissed.value[scope.value] ?? []
  if (current.includes(projectId)) return
  dismissed.value = { ...dismissed.value, [scope.value]: [...current, projectId] }
}

function dismissAll() {
  const ids = hints.value.map((hint) => hint.projectId)
  const current = dismissed.value[scope.value] ?? []
  dismissed.value = { ...dismissed.value, [scope.value]: [...new Set([...current, ...ids])] }
}
</script>

<template>
  <section v-if="show" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="Invite teammates">
    <header class="flex items-start gap-2.5 border-b border-border px-3 py-3 sm:items-center sm:px-4">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/12 text-teal-700 dark:text-teal-400">
        <UsersRound class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold">Projects need a second seat</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Teams with 3+ people stick. Invite someone into a thin project — they land on Start my day.
        </p>
      </div>
      <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Hide" @click="dismissAll"><X /></Button>
    </header>
    <ul class="divide-y divide-border/70">
      <li v-for="hint in hints.slice(0, 3)" :key="hint.projectId" class="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: hint.projectColor }" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] font-medium">{{ hint.projectName }}</p>
          <p class="text-[12px] text-muted-foreground tabular-nums">
            {{ hint.memberCount }} member{{ hint.memberCount === 1 ? '' : 's' }} — invite {{ Math.max(1, 3 - hint.memberCount) }} more
          </p>
        </div>
        <Button size="sm" variant="outline" class="max-sm:flex-1" as-child>
          <RouterLink :to="{ name: 'project-settings', params: { projectId: hint.projectId }, query: { tab: 'members' } }">
            <UserPlus /> Invite
          </RouterLink>
        </Button>
        <Button variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label="Dismiss" @click="dismiss(hint.projectId)"><X /></Button>
      </li>
    </ul>
  </section>
</template>
