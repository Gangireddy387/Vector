<script setup lang="ts">
import { Check, CheckSquare, MessageSquare, Paperclip } from 'lucide-vue-next'
import { computed } from 'vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { cn } from '@/lib/utils'
import type { Issue } from '@/types/models'

const props = withDefaults(
  defineProps<{ issue: Issue; showProject?: boolean; completable?: boolean; showStatus?: boolean; class?: string }>(),
  { showProject: false, completable: false, showStatus: false },
)
const emit = defineEmits<{ open: [issue: Issue]; complete: [issue: Issue] }>()

const isDone = computed(() => props.issue.status.category === 'done')
const visibleLabels = computed(() => props.issue.labels.slice(0, 3))
</script>

<template>
  <article
    :class="
      cn(
        'group cursor-pointer border border-border/70 bg-card p-3 text-left shadow-soft transition-all duration-150 hover:-translate-y-px hover:border-primary/35 hover:shadow-elevated focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none',
        props.class,
      )
    "
    tabindex="0"
    :aria-label="`${issue.key} ${issue.title}`"
    @click="emit('open', issue)"
    @keydown.enter="emit('open', issue)"
  >
    <div class="flex gap-2.5">
      <button
        v-if="completable"
        type="button"
        class="mt-0.5 flex size-5 shrink-0 items-center justify-center border-2 transition-colors"
        :class="isDone ? 'border-success bg-success text-white' : 'border-muted-foreground/40 hover:border-success'"
        :aria-label="isDone ? `${issue.key} is done` : `Complete ${issue.key}`"
        :disabled="isDone"
        @click.stop="emit('complete', issue)"
      >
        <Check v-if="isDone" class="size-3" stroke-width="3" />
      </button>

      <div class="min-w-0 flex-1 space-y-2">
        <p class="line-clamp-2 text-sm leading-snug font-medium" :class="isDone && 'text-muted-foreground line-through'">
          {{ issue.title }}
        </p>

        <div v-if="visibleLabels.length || issue.parent" class="flex flex-wrap items-center gap-1">
          <span
            v-if="issue.parent"
            class="max-w-40 truncate bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300"
            :title="issue.parent.title"
          >
            {{ issue.parent.title }}
          </span>
          <LabelChip v-for="label in visibleLabels" :key="label.id" :label="label" />
        </div>

        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <IssueTypeIcon :type="issue.type" />
          <span class="font-medium" :class="isDone && 'line-through'">{{ issue.key }}</span>
          <span v-if="showProject" class="truncate">· {{ issue.project.name }}</span>
          <span v-if="showStatus" class="truncate">· {{ issue.status.name }}</span>
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
            <span v-if="issue.storyPoints !== null" class=" bg-muted px-1.5 text-[11px] font-semibold tabular-nums" title="Story points">
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
