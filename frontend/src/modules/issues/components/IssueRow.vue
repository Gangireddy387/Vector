<script setup lang="ts">
import { GripVertical } from 'lucide-vue-next'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Checkbox } from '@/components/ui/checkbox'
import type { Issue } from '@/types/models'

withDefaults(
  defineProps<{ issue: Issue; selectable?: boolean; selected?: boolean; focused?: boolean; draggable?: boolean }>(),
  {
    selectable: false,
    selected: false,
    focused: false,
    draggable: false,
  },
)
const emit = defineEmits<{ open: [issue: Issue]; toggleSelect: [issue: Issue] }>()
</script>

<template>
  <div
    class="group flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border/70 bg-card px-3 py-2 text-[13px] transition-colors last:border-b-0 hover:bg-accent/60"
    :class="[selected && 'bg-accent hover:bg-accent', focused && 'bg-accent/80 ring-1 ring-inset ring-primary/40']"
    :data-issue-id="issue.id"
  >
    <GripVertical
      v-if="draggable"
      class="drag-handle size-4 shrink-0 cursor-grab text-muted-foreground/50 opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      tabindex="0"
      role="button"
      :aria-label="`Reorder ${issue.key}`"
    />
    <Checkbox
      v-if="selectable"
      :model-value="selected"
      :aria-label="`Select ${issue.key}`"
      @update:model-value="emit('toggleSelect', issue)"
      @click.stop
    />
    <IssueTypeIcon :type="issue.type" class="shrink-0" />
    <span class="w-[4.5rem] shrink-0 truncate text-xs font-medium text-muted-foreground sm:w-20" :class="issue.status.category === 'done' && 'line-through'">
      {{ issue.key }}
    </span>
    <button type="button" class="min-w-0 flex-1 basis-[min(100%,12rem)] truncate text-left hover:underline" @click="emit('open', issue)">
      {{ issue.title }}
    </button>
    <span v-if="issue.parent" class="hidden max-w-28 truncate rounded-[4px] bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 xl:inline 2xl:max-w-36 dark:text-violet-300">
      {{ issue.parent.title }}
    </span>
    <span class="hidden gap-1 lg:flex">
      <LabelChip v-for="label in issue.labels.slice(0, 2)" :key="label.id" :label="label" />
    </span>
    <DueDateBadge :due-date="issue.dueDate" :done="issue.status.category === 'done'" compact />
    <StatusBadge :status="issue.status" class="max-w-[7rem] min-w-0 shrink justify-center truncate lg:max-w-none lg:w-28" />
    <span class="hidden w-6 text-center text-xs font-semibold text-muted-foreground tabular-nums lg:inline">{{ issue.storyPoints ?? '–' }}</span>
    <PriorityIcon :priority="issue.priority" class="hidden sm:inline-flex" />
    <UserAvatar :user="issue.assignee" size="sm" show-tooltip class="hidden sm:inline-flex" />
    <slot name="actions" />
  </div>
</template>
