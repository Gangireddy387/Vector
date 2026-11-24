<script setup lang="ts">
import { CircleCheck, MessageSquare, Paperclip } from 'lucide-vue-next'
import { computed } from 'vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { PRIORITY_META } from '@/constants/issue'
import { getDueState } from '@/lib/format'
import type { Issue } from '@/types/models'
import type { BoardCardFields, BoardDensity } from '../composables/useBoardView'

/**
 * A task on the board, in the style of Linear and Jira: key and priority on top, the title, its epic and labels, and a
 * footer with the due date, sub-task progress, points and the assignee. `fields` and `density` come from the board's
 * Display menu.
 */
const props = defineProps<{ issue: Issue; fields: BoardCardFields; density: BoardDensity }>()
const emit = defineEmits<{ open: [issue: Issue] }>()

const isDone = computed(() => props.issue.status.category === 'done')
const compact = computed(() => props.density === 'compact')
const isOverdue = computed(() => getDueState(props.issue.dueDate, isDone.value) === 'overdue')
/** Urgent work stands out with a coloured edge. */
const accent = computed(() => (!isDone.value && (props.issue.priority === 'highest' || props.issue.priority === 'high') ? PRIORITY_META[props.issue.priority].color : null))
const labels = computed(() => (props.fields.labels ? props.issue.labels.slice(0, compact.value ? 2 : 3) : []))
const moreLabels = computed(() => (props.fields.labels ? Math.max(0, props.issue.labels.length - labels.value.length) : 0))
const epic = computed(() => (props.fields.epic && props.issue.parent ? props.issue.parent : null))
const subtasks = computed(() => props.issue.subtaskProgress)
const subtaskPercent = computed(() => (subtasks.value.total ? Math.round((subtasks.value.done / subtasks.value.total) * 100) : 0))
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
    class="group/card relative block w-full shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-card text-left shadow-[0_1px_2px_oklch(0_0_0/0.05)] transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-px hover:border-input hover:shadow-[0_6px_16px_-6px_oklch(0_0_0/0.18)] focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none active:translate-y-0 dark:shadow-none dark:hover:border-muted-foreground/30"
    :class="[isOverdue ? 'border-destructive/40' : 'border-border', compact ? 'px-2.5 py-2' : 'px-3 py-2.5', isDone && 'bg-card/70']"
    tabindex="0"
    :aria-label="`${issue.key} ${issue.title}${isDone ? ', done' : ''}`"
    @click="emit('open', issue)"
    @keydown.enter="emit('open', issue)"
  >
    <span v-if="accent" class="absolute inset-y-0 left-0 w-[3px]" :style="{ backgroundColor: accent }" aria-hidden="true" />

    <!-- Key, type and priority -->
    <div v-if="fields.key || fields.priority || isDone" class="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <template v-if="fields.key">
        <IssueTypeIcon :type="issue.type" />
        <span class="font-medium tracking-tight tabular-nums" :class="isDone && 'line-through'">{{ issue.key }}</span>
      </template>
      <span class="ml-auto flex items-center gap-1">
        <CircleCheck v-if="isDone" class="size-3.5 text-success" aria-label="Done" />
        <PriorityIcon v-if="fields.priority" :priority="issue.priority" />
      </span>
    </div>

    <p class="text-[13px] leading-snug font-medium text-foreground" :class="[compact ? 'line-clamp-1' : 'line-clamp-3', isDone && 'text-muted-foreground']">
      {{ issue.title }}
    </p>

    <!-- Epic and labels -->
    <div v-if="epic || labels.length" class="mt-2 flex flex-wrap items-center gap-1">
      <span
        v-if="epic"
        class="inline-flex h-5 max-w-44 items-center gap-1 truncate rounded-full bg-violet-500/10 px-2 text-[11px] font-medium text-violet-700 dark:text-violet-300"
        :title="`${epic.key} · ${epic.title}`"
      >
        <span class="size-1.5 shrink-0 rounded-full bg-violet-500" /> <span class="truncate">{{ epic.title }}</span>
      </span>
      <LabelChip v-for="label in labels" :key="label.id" :label="label" />
      <span v-if="moreLabels" class="text-[11px] text-muted-foreground">+{{ moreLabels }}</span>
    </div>

    <!-- Sub-task progress -->
    <div v-if="fields.counts && subtasks.total && !compact" class="mt-2.5 flex items-center gap-2" :title="`${subtasks.done} of ${subtasks.total} sub-tasks done`">
      <span class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <span class="block h-full rounded-full transition-[width]" :class="subtaskPercent === 100 ? 'bg-success' : 'bg-primary'" :style="{ width: `${subtaskPercent}%` }" />
      </span>
      <span class="text-[10.5px] font-medium text-muted-foreground tabular-nums">{{ subtasks.done }}/{{ subtasks.total }}</span>
    </div>

    <!-- Footer -->
    <div v-if="hasFooter" class="flex items-center gap-2 text-[11px] text-muted-foreground" :class="compact ? 'mt-1.5' : 'mt-2.5'">
      <DueDateBadge v-if="fields.dueDate" :due-date="issue.dueDate" :done="isDone" compact />
      <template v-if="fields.counts">
        <span v-if="compact && subtasks.total" class="tabular-nums" title="Sub-tasks done">{{ subtasks.done }}/{{ subtasks.total }}</span>
        <span v-if="issue.commentCount" class="inline-flex items-center gap-0.5 tabular-nums" title="Comments"><MessageSquare class="size-3" /> {{ issue.commentCount }}</span>
        <span v-if="issue.attachmentCount" class="inline-flex items-center gap-0.5 tabular-nums" title="Attachments"><Paperclip class="size-3" /> {{ issue.attachmentCount }}</span>
      </template>
      <span class="ml-auto flex items-center gap-1.5">
        <span
          v-if="fields.points && issue.storyPoints !== null"
          class="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10.5px] font-semibold text-foreground/80 tabular-nums"
          title="Story points"
        >
          {{ issue.storyPoints }}
        </span>
        <UserAvatar v-if="fields.assignee" :user="issue.assignee" size="sm" show-tooltip />
      </span>
    </div>
  </article>
</template>
