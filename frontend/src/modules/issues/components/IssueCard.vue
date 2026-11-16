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

const isDone = computed(() => props.issue.status.category === 'done')
const visibleLabels = computed(() => props.issue.labels.slice(0, props.grid ? 4 : 3))
</script>

<template>
  <article
    :class="
      cn(
        'group cursor-pointer rounded-lg border border-border bg-card text-left shadow-soft transition-[border-color,box-shadow,background-color] duration-150 hover:border-input hover:shadow-[0_2px_8px_-2px_oklch(0_0_0/0.1)] focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none dark:hover:border-muted-foreground/30',
        grid ? 'flex h-full flex-col gap-3 p-3.5' : 'p-3',
        selected && 'border-primary/40 bg-accent/50',
        props.class,
      )
    "
    tabindex="0"
    :aria-label="`${issue.key} ${issue.title}`"
    @click="emit('open', issue)"
    @keydown.enter="emit('open', issue)"
  >
    <div class="flex gap-2.5" :class="grid && 'min-h-0 flex-1 flex-col'">
      <div v-if="selectable || completable" class="flex shrink-0 items-start gap-2" :class="grid && 'justify-between'">
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
        <StatusBadge v-if="grid && showStatus" :status="issue.status" class="ml-auto max-w-[9rem] truncate" />
      </div>

      <div class="min-w-0 flex-1 space-y-2" :class="grid && 'flex flex-col'">
        <div v-if="grid" class="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <IssueTypeIcon :type="issue.type" />
          <span class="font-medium" :class="isDone && 'line-through'">{{ issue.key }}</span>
          <span v-if="showProject" class="min-w-0 truncate">· {{ issue.project.name }}</span>
          <StatusBadge v-if="showStatus && !selectable && !completable" :status="issue.status" class="ml-auto max-w-[9rem] truncate" />
        </div>

        <p
          class="text-[13px] leading-snug font-medium"
          :class="[isDone && 'text-muted-foreground line-through', grid ? 'line-clamp-3 min-h-[2.6em]' : 'line-clamp-2']"
        >
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

        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground"
          :class="grid && 'mt-auto pt-1'"
        >
          <template v-if="!grid">
            <IssueTypeIcon :type="issue.type" />
            <span class="font-medium" :class="isDone && 'line-through'">{{ issue.key }}</span>
            <span v-if="showProject" class="truncate">· {{ issue.project.name }}</span>
            <span v-if="showStatus" class="truncate">· {{ issue.status.name }}</span>
          </template>
          <span v-if="issue.subtaskProgress.total" class="inline-flex items-center gap-0.5" title="Sub-tasks done">
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
  </article>
</template>
