<script setup lang="ts">
import { computed } from 'vue'
import { type SortableEvent, VueDraggable } from 'vue-draggable-plus'
import { cn } from '@/lib/utils'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import type { Issue, Status } from '@/types/models'

const props = withDefaults(defineProps<{ status: Status; projectId: string; sprintId?: string | null; editable?: boolean }>(), {
  sprintId: null,
  editable: true,
})
const issues = defineModel<Issue[]>({ required: true })
const emit = defineEmits<{ open: [issue: Issue]; dragStart: []; dragEnd: [event: SortableEvent] }>()

const points = computed(() => issues.value.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0))
const isOverLimit = computed(() => props.status.wipLimit !== null && issues.value.length > props.status.wipLimit)
</script>

<template>
  <!-- Columns grow with their cards; the board scrolls as a whole and headers stay pinned. -->
  <section
    :class="
      cn(
        'flex min-w-56 flex-1 basis-0 flex-col border border-border/60 bg-muted/45',
        isOverLimit && 'bg-destructive/5 ring-1 ring-destructive/40',
      )
    "
    :aria-label="`${status.name} column`"
  >
    <header
      class="sticky top-0 z-10 border-b border-border/60"
      :class="
        isOverLimit
          ? 'bg-[color-mix(in_oklch,var(--destructive)_5%,var(--background))]'
          : 'bg-[color-mix(in_oklch,var(--muted)_45%,var(--background))]'
      "
    >
      <div class="flex items-center gap-2 px-3 py-2.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: status.color }" />
        <h2 class="truncate text-xs font-semibold tracking-wide uppercase">{{ status.name }}</h2>
        <span class="bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-xs tabular-nums">
          {{ issues.length }}<template v-if="status.wipLimit !== null">/{{ status.wipLimit }}</template>
        </span>
        <span v-if="points" class="ml-auto text-[11px] text-muted-foreground tabular-nums" title="Story points">{{ points }} pts</span>
      </div>
      <p v-if="isOverLimit" class="px-3 pb-2 text-[11px] font-medium text-destructive">Over the WIP limit — finish work before starting more.</p>
    </header>

    <VueDraggable
      v-model="issues"
      group="board"
      :animation="150"
      :disabled="!editable"
      ghost-class="opacity-40"
      drag-class="rotate-2"
      :data-status-id="status.id"
      class="flex min-h-24 flex-1 flex-col gap-2 p-2"
      @start="emit('dragStart')"
      @end="(event: SortableEvent) => emit('dragEnd', event)"
    >
      <IssueCard v-for="issue in issues" :key="issue.id" :issue="issue" :data-issue-id="issue.id" @open="emit('open', $event)" />
    </VueDraggable>

    <div v-if="editable" class="px-2 pb-2">
      <QuickAddInput :project-id="projectId" :defaults="{ statusId: status.id, sprintId }" placeholder="Add task…" />
    </div>
  </section>
</template>
