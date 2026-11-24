<script setup lang="ts">
import { ChevronDown, ChevronRight, UserRound } from 'lucide-vue-next'
import { computed } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { formatDate, getDueState } from '@/lib/format'
import type { Issue } from '@/types/models'
import { flattenRows, type RoadmapRow } from '../lib/roadmap-timeline'

const props = withDefaults(
  defineProps<{
    rows: RoadmapRow[]
    expanded: Set<string>
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  toggle: [issueId: string]
  open: [issue: Issue]
}>()

const flat = computed(() => flattenRows(props.rows, props.expanded))

/** Shared grid so header + rows stay column-aligned across breakpoints. */
const gridCols =
  'grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_7.5rem_2.75rem] md:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_2.75rem]'

function fieldDates(row: RoadmapRow) {
  const start = row.issue.startDate || row.bar?.start || null
  const end = row.issue.dueDate || row.bar?.end || null
  if (!start && !end) return '—'
  if (start && end && start !== end) return `${formatDate(start, 'd MMM')} – ${formatDate(end, 'd MMM')}`
  return formatDate(start || end, 'd MMM')
}

function isOverdue(issue: Issue) {
  return getDueState(issue.dueDate, issue.status?.category === 'done') === 'overdue'
}

function statusTone(issue: Issue) {
  if (issue.status?.category === 'done') return 'bg-success/15 text-success'
  if (isOverdue(issue)) return 'bg-destructive/10 text-destructive'
  if (issue.status?.category === 'in_progress') return 'bg-primary/10 text-primary'
  return 'bg-muted text-muted-foreground'
}

function dateHint(row: RoadmapRow) {
  if (!row.bar) return 'No dates'
  if (row.bar.point) return formatDate(row.bar.start, 'd MMM')
  return `${formatDate(row.bar.start, 'd MMM')} – ${formatDate(row.bar.end, 'd MMM')}`
}
</script>

<template>
  <!-- Phone: stacked cards -->
  <div v-if="compact" class="space-y-2 stagger-in">
    <article
      v-for="row in flat"
      :key="row.issue.id"
      class="relative overflow-hidden rounded-lg border border-border bg-card p-3"
      :class="isOverdue(row.issue) && 'border-destructive/40'"
      :style="{ marginLeft: `${row.depth * 12}px` }"
    >
      <div class="flex items-start gap-2">
        <button
          v-if="row.children.length"
          type="button"
          class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground"
          :aria-label="expanded.has(row.issue.id) ? 'Collapse' : 'Expand'"
          @click="emit('toggle', row.issue.id)"
        >
          <ChevronDown v-if="expanded.has(row.issue.id)" class="size-4" />
          <ChevronRight v-else class="size-4" />
        </button>
        <button type="button" class="min-w-0 flex-1 text-left" @click="emit('open', row.issue)">
          <div class="flex items-center gap-1.5">
            <IssueTypeIcon :type="row.issue.type" class="size-3.5 shrink-0" />
            <span class="font-mono text-[11px] text-primary">{{ row.issue.key }}</span>
            <UserAvatar :user="row.issue.assignee" size="xs" class="ml-auto" />
          </div>
          <p class="mt-1 text-sm font-medium leading-snug">{{ row.issue.title }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ dateHint(row) }}
            <span v-if="isOverdue(row.issue)" class="ml-1 font-medium text-destructive">· Overdue</span>
            <span v-else-if="row.issue.status" class="ml-1">· {{ row.issue.status.name }}</span>
          </p>
        </button>
      </div>
    </article>
    <p v-if="!flat.length" class="px-2 py-10 text-center text-sm text-muted-foreground">No work items match this view.</p>
  </div>

  <!-- Desktop / tablet: aligned list columns -->
  <div v-else class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
    <div
      class="grid h-9 items-center border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground"
      :class="gridCols"
    >
      <div class="min-w-0 px-3">Work items</div>
      <div class="hidden border-l border-border/70 px-3 sm:block">Status</div>
      <div class="hidden border-l border-border/70 px-3 md:block">Dates</div>
      <div class="flex items-center justify-center border-l border-border/70" title="Assignee">
        <UserRound class="size-3.5 opacity-70" aria-hidden="true" />
        <span class="sr-only">Assignee</span>
      </div>
    </div>

    <div v-if="!flat.length" class="px-4 py-12 text-center text-sm text-muted-foreground">
      No work items match this view.
    </div>

    <div v-else>
      <div
        v-for="row in flat"
        :key="row.issue.id"
        class="group grid h-11 items-center border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/35"
        :class="gridCols"
      >
        <div
          class="flex min-w-0 items-center gap-2 overflow-hidden px-2 sm:px-3"
          :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
        >
          <button
            v-if="row.children.length"
            type="button"
            class="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="expanded.has(row.issue.id) ? 'Collapse' : 'Expand'"
            @click="emit('toggle', row.issue.id)"
          >
            <ChevronDown v-if="expanded.has(row.issue.id)" class="size-3.5" />
            <ChevronRight v-else class="size-3.5" />
          </button>
          <span v-else class="size-5 shrink-0" aria-hidden="true" />

          <IssueTypeIcon :type="row.issue.type" class="size-3.5 shrink-0" />

          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left text-[13px] leading-none"
            :title="`${row.issue.key} ${row.issue.title}`"
            @click="emit('open', row.issue)"
          >
            <span class="shrink-0 font-mono text-[11px] font-medium text-primary hover:underline">
              {{ row.issue.key }}
            </span>
            <span class="min-w-0 truncate font-medium text-foreground">{{ row.issue.title }}</span>
          </button>
        </div>

        <div class="hidden h-full items-center border-l border-border/60 px-3 sm:flex">
          <span
            v-if="row.issue.status"
            class="inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[10px] font-medium leading-none"
            :class="statusTone(row.issue)"
            :title="row.issue.status.name"
          >
            {{ row.issue.status.name }}
          </span>
          <span v-else class="text-[11px] text-muted-foreground/50">—</span>
        </div>

        <div
          class="hidden h-full items-center border-l border-border/60 px-3 tabular-nums text-[11px] text-muted-foreground md:flex"
          :title="fieldDates(row)"
        >
          <span class="truncate">{{ fieldDates(row) }}</span>
        </div>

        <div class="flex h-full items-center justify-center border-l border-border/60">
          <UserAvatar :user="row.issue.assignee" size="xs" show-tooltip />
        </div>
      </div>
    </div>
  </div>
</template>
