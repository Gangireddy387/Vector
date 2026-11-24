<script setup lang="ts">
import { Check, CheckSquare, MessageSquare, Paperclip } from 'lucide-vue-next'
import { computed } from 'vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { Issue } from '@/types/models'

const props = withDefaults(
  defineProps<{
    issue: Issue
    showProject?: boolean
    completable?: boolean
    showStatus?: boolean
    /** Richer card for the Tasks grid: status chip and more breathing room. */
    grid?: boolean
    selectable?: boolean
    selected?: boolean
    class?: string
  }>(),
  { showProject: false, completable: false, showStatus: false, grid: false, selectable: false, selected: false },
)
const emit = defineEmits<{ open: [issue: Issue]; complete: [issue: Issue]; toggleSelect: [issue: Issue] }>()

const isDone = computed(() => props.issue.status?.category === 'done')
const visibleLabels = computed(() => (props.issue.labels ?? []).slice(0, props.grid ? 4 : 3))
</script>

<template>
  <article
    :class="
      cn(
        'group cursor-pointer rounded-xl border border-border/80 bg-card text-left shadow-soft transition-[border-color,box-shadow,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none active:translate-y-0 dark:hover:border-primary/30',
        grid ? 'flex h-full min-h-0 flex-col gap-2.5 p-3.5' : 'p-3',
        selected && 'border-primary/40 bg-accent/50',
        props.class,
      )
    "
    tabindex="0"
    :aria-label="`${issue.key} ${issue.title}`"
    @click="emit('open', issue)"
    @keydown.enter="emit('open', issue)"
  >
    <!-- Compact stacked card (phone / non-grid) -->
    <div v-if="!grid" class="flex gap-2.5">
      <div v-if="selectable || completable" class="flex shrink-0 items-start gap-2">
        <Checkbox
          v-if="selectable"
          :model-value="selected"
          :aria-label="`Select ${issue.key}`"
          class="mt-0.5"
          @update:model-value="emit('toggleSelect', issue)"
          @click.stop
        />
        <button
          v-if="completable"
          type="button"
          class="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
          :class="isDone ? 'border-success bg-success text-white' : 'border-muted-foreground/40 hover:border-success'"
          :aria-label="isDone ? `${issue.key} is done` : `Complete ${issue.key}`"
          :disabled="isDone"
          @click.stop="emit('complete', issue)"
        >
          <Check v-if="isDone" class="size-3" stroke-width="3" />
        </button>
      </div>
      <div class="min-w-0 flex-1 space-y-2">
        <p class="line-clamp-2 text-[13px] leading-snug font-medium" :class="isDone && 'text-muted-foreground line-through'">
          {{ issue.title }}
        </p>
        <div v-if="visibleLabels.length || issue.parent" class="flex flex-wrap items-center gap-1">
          <span
            v-if="issue.parent"
            class="max-w-40 truncate rounded-[4px] bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300"
            :title="issue.parent.title"
          >
            {{ issue.parent.title }}
          </span>
          <LabelChip v-for="label in visibleLabels" :key="label.id" :label="label" />
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] text-muted-foreground">
          <IssueTypeIcon :type="issue.type" class="shrink-0" />
          <span class="shrink-0 font-medium" :class="isDone && 'line-through'">{{ issue.key }}</span>
          <span v-if="showProject && issue.project" class="min-w-0 truncate">· {{ issue.project.name }}</span>
          <span v-if="showStatus && issue.status" class="min-w-0 truncate">· {{ issue.status.name }}</span>
          <span v-if="issue.subtaskProgress?.total" class="inline-flex items-center gap-0.5" title="Sub-tasks done">
            <CheckSquare class="size-3" /> {{ issue.subtaskProgress.done }}/{{ issue.subtaskProgress.total }}
          </span>
          <span v-if="issue.commentCount" class="inline-flex items-center gap-0.5" title="Comments">
            <MessageSquare class="size-3" /> {{ issue.commentCount }}
          </span>
          <span v-if="issue.attachmentCount" class="inline-flex items-center gap-0.5" title="Attachments">
            <Paperclip class="size-3" /> {{ issue.attachmentCount }}
          </span>
          <span class="ml-auto flex shrink-0 items-center gap-1.5">
            <DueDateBadge :due-date="issue.dueDate" :done="isDone" compact />
            <span v-if="issue.storyPoints !== null" class="rounded-[4px] border border-border px-1 text-[10.5px] font-medium tabular-nums" title="Story points">
              {{ issue.storyPoints }}
            </span>
            <PriorityIcon :priority="issue.priority" />
            <UserAvatar :user="issue.assignee" size="sm" show-tooltip />
          </span>
        </div>
      </div>
    </div>

    <!-- Grid: equal-height cards with footer pinned to the bottom -->
    <template v-else>
      <div class="flex items-start gap-2">
        <Checkbox
          v-if="selectable"
          :model-value="selected"
          :aria-label="`Select ${issue.key}`"
          class="mt-0.5 shrink-0"
          @update:model-value="emit('toggleSelect', issue)"
          @click.stop
        />
        <button
          v-if="completable"
          type="button"
          class="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
          :class="isDone ? 'border-success bg-success text-white' : 'border-muted-foreground/40 hover:border-success'"
          :aria-label="isDone ? `${issue.key} is done` : `Complete ${issue.key}`"
          :disabled="isDone"
          @click.stop="emit('complete', issue)"
        >
          <Check v-if="isDone" class="size-3" stroke-width="3" />
        </button>
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <IssueTypeIcon :type="issue.type" class="shrink-0" />
          <span class="font-medium" :class="isDone && 'line-through'">{{ issue.key }}</span>
          <span v-if="showProject && issue.project" class="min-w-0 truncate">· {{ issue.project.name }}</span>
        </div>
        <StatusBadge v-if="showStatus && issue.status" :status="issue.status" class="max-w-[8rem] shrink-0 truncate" />
      </div>

      <p
        class="line-clamp-3 min-h-[3.9em] text-[13px] leading-snug font-medium text-pretty"
        :class="isDone && 'text-muted-foreground line-through'"
      >
        {{ issue.title }}
      </p>

      <div class="flex min-h-[1.5rem] flex-wrap items-center gap-1">
        <span
          v-if="issue.parent"
          class="max-w-40 truncate rounded-[4px] bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300"
          :title="issue.parent.title"
        >
          {{ issue.parent.title }}
        </span>
        <LabelChip v-for="label in visibleLabels" :key="label.id" :label="label" />
      </div>

      <div class="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2.5 text-[11.5px] text-muted-foreground">
        <span v-if="issue.subtaskProgress?.total" class="inline-flex items-center gap-0.5" title="Sub-tasks done">
          <CheckSquare class="size-3" /> {{ issue.subtaskProgress.done }}/{{ issue.subtaskProgress.total }}
        </span>
        <span v-if="issue.commentCount" class="inline-flex items-center gap-0.5" title="Comments">
          <MessageSquare class="size-3" /> {{ issue.commentCount }}
        </span>
        <span v-if="issue.attachmentCount" class="inline-flex items-center gap-0.5" title="Attachments">
          <Paperclip class="size-3" /> {{ issue.attachmentCount }}
        </span>
        <span class="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <DueDateBadge :due-date="issue.dueDate" :done="isDone" compact />
          <span v-if="issue.storyPoints !== null" class="rounded-[4px] border border-border px-1 text-[10.5px] font-medium tabular-nums" title="Story points">
            {{ issue.storyPoints }}
          </span>
          <PriorityIcon :priority="issue.priority" />
          <UserAvatar :user="issue.assignee" size="sm" show-tooltip />
        </span>
      </div>
    </template>
  </article>
</template>
