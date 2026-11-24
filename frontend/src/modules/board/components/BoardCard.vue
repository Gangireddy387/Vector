<script setup lang="ts">
import { CircleCheck, MessageSquare, Paperclip, UserRound } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { PRIORITY_META } from '@/constants/issue'
import { getDueState } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import type { Issue } from '@/types/models'
import type { BoardCardFields, BoardDensity } from '../composables/useBoardView'
import BoardCardAiHint from './BoardCardAiHint.vue'

/**
 * A task on the board, in the style of Linear and Jira: key and priority on top, the title, its epic and labels, and a
 * footer with the due date, sub-task progress, points and the assignee. `fields` and `density` come from the board's
 * Display menu.
 */
const props = defineProps<{ issue: Issue; fields: BoardCardFields; density: BoardDensity }>()
const emit = defineEmits<{ open: [issue: Issue] }>()

const { highlightedIssueId } = storeToRefs(useUiStore())
const isFlashing = computed(() => highlightedIssueId.value === props.issue.id)
const isDone = computed(() => props.issue.status.category === 'done')
const compact = computed(() => props.density === 'compact')
const isOverdue = computed(() => getDueState(props.issue.dueDate, isDone.value) === 'overdue')
/** Urgent work stands out with a coloured edge. */
const accent = computed(() =>
  !isDone.value && (props.issue.priority === 'highest' || props.issue.priority === 'high')
    ? PRIORITY_META[props.issue.priority].color
    : null,
)
const labels = computed(() => (props.fields.labels ? props.issue.labels.slice(0, compact.value ? 2 : 3) : []))
const moreLabels = computed(() => (props.fields.labels ? Math.max(0, props.issue.labels.length - labels.value.length) : 0))
const epic = computed(() => (props.fields.epic && props.issue.parent ? props.issue.parent : null))
const subtasks = computed(() => props.issue.subtaskProgress)
const subtaskPercent = computed(() => (subtasks.value.total ? Math.round((subtasks.value.done / subtasks.value.total) * 100) : 0))
const hasMeta = computed(() => Boolean(epic.value || labels.value.length))
const hasFooter = computed(
  () =>
    (props.fields.dueDate && props.issue.dueDate) ||
    (props.fields.counts && (subtasks.value.total || props.issue.commentCount || props.issue.attachmentCount)) ||
    (props.fields.points && props.issue.storyPoints !== null) ||
    props.fields.assignee,
)
</script>

<template>
  <article
    class="board-card group/card relative block w-full shrink-0 cursor-pointer overflow-hidden rounded-[10px] border bg-card text-left outline-none"
    :class="[
      isOverdue ? 'border-destructive/45' : 'border-border/90',
      compact ? 'py-1.5 pr-2.5' : 'py-2.5 pr-3',
      accent ? (compact ? 'pl-3' : 'pl-3.5') : compact ? 'pl-2.5' : 'pl-3',
      isDone && 'board-card--done',
      isFlashing && 'motion-flash',
    ]"
    tabindex="0"
    :aria-label="`${issue.key} ${issue.title}${isDone ? ', done' : ''}`"
    @click="emit('open', issue)"
    @keydown.enter="emit('open', issue)"
  >
    <span
      v-if="accent"
      class="absolute inset-y-1 left-0 w-[3px] rounded-full"
      :style="{ backgroundColor: accent }"
      aria-hidden="true"
    />

    <!-- Key, type and priority -->
    <div
      v-if="fields.key || fields.priority || isDone"
      class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      :class="compact ? 'mb-0.5' : 'mb-1'"
    >
      <template v-if="fields.key">
        <IssueTypeIcon :type="issue.type" class="opacity-90" />
        <span class="font-medium tracking-tight tabular-nums" :class="isDone && 'line-through decoration-muted-foreground/50'">{{ issue.key }}</span>
      </template>
      <span class="ml-auto flex items-center gap-1">
        <CircleCheck v-if="isDone" class="size-3.5 text-success" aria-label="Done" />
        <PriorityIcon v-if="fields.priority" :priority="issue.priority" />
      </span>
    </div>

    <p
      class="text-[13px] leading-snug font-medium text-foreground"
      :class="[compact ? 'line-clamp-1' : 'line-clamp-3', isDone && 'text-muted-foreground']"
    >
      {{ issue.title }}
    </p>

    <!-- Epic and labels -->
    <div v-if="hasMeta" class="flex flex-wrap items-center gap-1" :class="compact ? 'mt-1.5' : 'mt-2'">
      <span
        v-if="epic"
        class="inline-flex h-5 max-w-44 items-center gap-1 truncate rounded-md bg-violet-500/10 px-1.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-500/15 dark:text-violet-300"
        :title="`${epic.key} · ${epic.title}`"
      >
        <span class="size-1.5 shrink-0 rounded-full bg-violet-500" />
        <span class="truncate">{{ epic.title }}</span>
      </span>
      <LabelChip v-for="label in labels" :key="label.id" :label="label" />
      <span v-if="moreLabels" class="text-[11px] text-muted-foreground">+{{ moreLabels }}</span>
    </div>

    <!-- Sub-task progress -->
    <div
      v-if="fields.counts && subtasks.total && !compact"
      class="mt-2.5 flex items-center gap-2"
      :title="`${subtasks.done} of ${subtasks.total} sub-tasks done`"
    >
      <span class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          class="block h-full rounded-full transition-[width] duration-300 ease-out"
          :class="subtaskPercent === 100 ? 'bg-success' : 'bg-primary'"
          :style="{ width: `${subtaskPercent}%` }"
        />
      </span>
      <span class="text-[10.5px] font-medium text-muted-foreground tabular-nums">{{ subtasks.done }}/{{ subtasks.total }}</span>
    </div>

    <BoardCardAiHint
      v-if="fields.aiHint && !isDone"
      :issue="issue"
      :compact="compact"
      :class="compact ? 'opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100' : ''"
    />

    <!-- Footer -->
    <div
      v-if="hasFooter"
      class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      :class="compact ? 'mt-1.5' : 'mt-2.5'"
    >
      <DueDateBadge v-if="fields.dueDate" :due-date="issue.dueDate" :done="isDone" compact />
      <template v-if="fields.counts">
        <span v-if="compact && subtasks.total" class="tabular-nums" title="Sub-tasks done">{{ subtasks.done }}/{{ subtasks.total }}</span>
        <span
          v-if="issue.commentCount"
          class="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 tabular-nums transition-colors group-hover/card:bg-muted/80"
          title="Comments"
        >
          <MessageSquare class="size-3" /> {{ issue.commentCount }}
        </span>
        <span
          v-if="issue.attachmentCount"
          class="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 tabular-nums transition-colors group-hover/card:bg-muted/80"
          title="Attachments"
        >
          <Paperclip class="size-3" /> {{ issue.attachmentCount }}
        </span>
      </template>
      <span class="ml-auto flex items-center gap-1.5">
        <span
          v-if="fields.points && issue.storyPoints !== null"
          class="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10.5px] font-semibold text-foreground/80 tabular-nums ring-1 ring-border/60"
          title="Story points"
        >
          {{ issue.storyPoints }}
        </span>
        <UserAvatar v-if="fields.assignee && issue.assignee" :user="issue.assignee" size="sm" show-tooltip />
        <span
          v-else-if="fields.assignee"
          class="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 text-muted-foreground/70"
          title="Unassigned"
          aria-label="Unassigned"
        >
          <UserRound class="size-3" />
        </span>
      </span>
    </div>
  </article>
</template>

<style scoped>
.board-card {
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.04),
    0 0 0 1px color-mix(in oklch, var(--border) 55%, transparent);
  transition:
    transform var(--motion-base, 180ms) var(--ease-out-soft, ease),
    box-shadow var(--motion-base, 180ms) var(--ease-out-soft, ease),
    border-color var(--motion-fast, 120ms) ease,
    background-color var(--motion-fast, 120ms) ease;
}
.board-card.board-card--done {
  background: color-mix(in oklch, var(--card) 78%, var(--muted));
  opacity: 0.92;
}
.board-card:hover {
  z-index: 1;
  border-color: color-mix(in oklch, var(--primary) 28%, var(--border));
  box-shadow: var(--shadow-elevated);
  transform: translateY(-2px);
}
.board-card:active {
  transform: translateY(0);
  box-shadow: var(--shadow-soft);
}
.board-card:focus-visible {
  border-color: color-mix(in oklch, var(--ring) 55%, var(--border));
  box-shadow:
    var(--shadow-soft),
    0 0 0 3px color-mix(in oklch, var(--ring) 28%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .board-card,
  .board-card:hover,
  .board-card:active {
    transition: none;
    transform: none;
  }
}
</style>
