<script setup lang="ts">
import { PartyPopper, RefreshCw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import { useIssueActions } from '@/modules/issues/composables/useIssueActions'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import type { Issue } from '@/types/models'
import { useDashboardData } from '../composables/useDashboardData'
import { bucketOf } from '../my-work'
import QuickCapture from './QuickCapture.vue'

type Segment = 'today' | 'upcoming' | 'anytime' | 'done'

const auth = useAuthStore()
const actions = useIssueActions()
const openIssue = useOpenIssue()
const { data, isLoading, reload } = useDashboardData()
const segment = ref<Segment>('today')

const SEGMENTS: Array<{ value: Segment; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'anytime', label: 'Anytime' },
  { value: 'done', label: 'Done' },
]

/** "Today" is what needs attention now: overdue, due today, or already in progress. */
const segmentOf = (issue: Issue): Segment => {
  const bucket = bucketOf(issue)
  if (bucket === 'done') return 'done'
  if (bucket === 'overdue' || bucket === 'today' || issue.status.category === 'in_progress') return 'today'
  if (bucket === 'anytime') return 'anytime'
  return 'upcoming'
}

const bySegment = computed(() => {
  const result: Record<Segment, Issue[]> = { today: [], upcoming: [], anytime: [], done: [] }
  for (const issue of data.value?.myWork ?? []) result[segmentOf(issue)].push(issue)
  return result
})
const visible = computed(() => bySegment.value[segment.value])
const summary = computed(() => {
  const stats = data.value?.stats
  if (!stats) return ''
  const parts = [stats.dueToday && `${stats.dueToday} due today`, stats.overdue && `${stats.overdue} overdue`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nothing urgent. Nice.'
})

async function complete(issue: Issue) {
  if (await actions.complete(issue)) await reload()
}
</script>

<template>
  <div class="space-y-4 p-3">
    <div class="flex items-start justify-between gap-2 px-1">
      <div>
        <p class="text-lg font-semibold">Hi {{ auth.user?.name.split(' ')[0] }}</p>
        <p class="text-sm" :class="data?.stats.overdue ? 'text-destructive' : 'text-muted-foreground'">{{ summary }}</p>
      </div>
      <Button variant="ghost" size="icon" aria-label="Refresh" @click="reload"><RefreshCw /></Button>
    </div>

    <QuickCapture stacked />

    <div class="grid grid-cols-4 gap-1 bg-muted p-1" role="tablist" aria-label="Task groups">
      <button
        v-for="item in SEGMENTS"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="segment === item.value"
        class=" py-2 text-xs font-medium transition"
        :class="segment === item.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
        @click="segment = item.value"
      >
        {{ item.label }}
        <span class="ml-0.5 opacity-70">{{ bySegment[item.value].length }}</span>
      </button>
    </div>

    <div v-if="isLoading" class="space-y-2">
      <Skeleton v-for="index in 4" :key="index" class="h-20 w-full" />
    </div>
    <EmptyState
      v-else-if="!visible.length"
      :icon="PartyPopper"
      :title="segment === 'done' ? 'Nothing completed yet this week' : 'All clear here'"
      :description="segment === 'today' ? 'No overdue or urgent work. Capture something above or check Upcoming.' : undefined"
    />
    <ul v-else class="space-y-2">
      <li v-for="issue in visible" :key="issue.id">
        <IssueCard :issue="issue" show-project completable @open="openIssue" @complete="complete" />
      </li>
    </ul>
  </div>
</template>
