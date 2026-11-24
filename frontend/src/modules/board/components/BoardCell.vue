<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { type SortableEvent, VueDraggable } from 'vue-draggable-plus'
import { type CreateIssueInput } from '@/modules/issues/api/issues.api'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import type { Issue, Status } from '@/types/models'
import type { BoardViewState } from '../composables/useBoardView'
import BoardCard from './BoardCard.vue'

/**
 * The cards of one status (in one swimlane): a drop zone while dragging, and an "Add task" box at the bottom whose new
 * task lands here (`defaults`: this status and the swimlane's assignee, priority…). `group`: cards move between cells
 * of the same group.
 */
const props = defineProps<{
  status: Status
  laneKey: string
  group: string
  projectId: string
  defaults: Partial<CreateIssueInput>
  view: BoardViewState
  editable: boolean
  dragging: boolean
  adding: boolean
  /** Runs down to the bottom of the board, with "Add task" pinned at its foot (boards without swimlanes). */
  fill?: boolean
}>()
const issues = defineModel<Issue[]>({ required: true })
const emit = defineEmits<{
  open: [issue: Issue]
  dragStart: []
  dragEnd: [event: SortableEvent]
  keyMove: [issue: Issue, move: { column?: -1 | 1; within?: -1 | 1 }]
  add: []
  closeAdd: []
}>()

/** Alt + arrow keys move a focused card: left/right between columns, up/down within the column. */
function onCardKey(event: KeyboardEvent, issue: Issue) {
  if (!props.editable || !event.altKey) return
  const moves: Record<string, { column?: -1 | 1; within?: -1 | 1 }> = {
    ArrowLeft: { column: -1 },
    ArrowRight: { column: 1 },
    ArrowUp: { within: -1 },
    ArrowDown: { within: 1 },
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  emit('keyMove', issue, move)
}
</script>

<template>
  <div
    class="group/cell flex flex-col rounded-xl bg-muted/50 p-1.5 transition-colors dark:bg-muted/35"
    :class="[
      fill || (dragging && editable) ? 'min-h-0 self-stretch' : 'self-start',
      dragging && editable && 'bg-primary/[0.04] outline-1 outline-primary/25 outline-dashed dark:bg-primary/[0.06]',
    ]"
  >
    <div class="relative flex min-h-0 flex-1 flex-col" :class="fill && 'overflow-hidden'">
      <p
        v-if="!issues.length"
        class="pointer-events-none absolute inset-x-0 top-0 z-0 flex h-12 items-center justify-center text-[11.5px] text-muted-foreground/70"
      >
        {{ dragging ? 'Drop here' : 'No tasks' }}
      </p>
      <!-- Scroll on a wrapper — not on VueDraggable — or Sortable can stack cards with absolute offsets. -->
      <div
        class="relative z-[1] flex min-h-0 flex-1 flex-col"
        :class="fill ? 'overflow-y-auto overscroll-contain scrollbar-thin' : ''"
      >
        <VueDraggable
          v-model="issues"
          :group="group"
          :animation="180"
          :disabled="!editable"
          ghost-class="board-ghost"
          chosen-class="board-chosen"
          drag-class="board-drag"
          :data-status-id="status.id"
          :data-lane="laneKey"
          class="flex flex-col gap-1.5"
          :class="(!issues.length || dragging) && 'min-h-12'"
          @start="emit('dragStart')"
          @end="(event: SortableEvent) => emit('dragEnd', event)"
        >
          <BoardCard
            v-for="issue in issues"
            :key="issue.id"
            :issue="issue"
            :fields="view.fields"
            :density="view.density"
            :data-issue-id="issue.id"
            :aria-keyshortcuts="editable ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown' : undefined"
            @open="emit('open', $event)"
            @keydown="onCardKey($event, issue)"
          />
        </VueDraggable>
      </div>
    </div>

    <div
      v-if="editable"
      class="shrink-0 pt-1"
      :class="
        fill &&
        '-mx-1.5 -mb-1.5 rounded-b-xl bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] px-1.5 pb-1.5 dark:bg-[color-mix(in_oklch,var(--muted)_35%,var(--background))]'
      "
    >
      <div v-if="adding" class="flex items-start gap-1">
        <QuickAddInput :project-id="projectId" :defaults="defaults" placeholder="Task title… Enter to add" autofocus class="min-w-0 flex-1" />
        <button type="button" class="mt-1.5 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Stop adding" title="Done adding" @click="emit('closeAdd')">
          <X class="size-4" />
        </button>
      </div>
      <button
        v-else
        type="button"
        class="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground/80 transition-colors hover:bg-background/80 hover:text-foreground"
        @click="emit('add')"
      >
        <Plus class="size-4" /> Add task
      </button>
    </div>
  </div>
</template>

<style scoped>
:deep(.board-ghost) {
  opacity: 1;
  border-style: dashed;
  border-color: color-mix(in oklch, var(--primary) 45%, transparent);
  background: color-mix(in oklch, var(--primary) 6%, transparent);
  box-shadow: none;
}
:deep(.board-ghost > *) {
  visibility: hidden;
}
:deep(.board-drag) {
  transform: rotate(2deg);
  box-shadow: 0 18px 40px -12px oklch(0 0 0 / 0.35);
}
</style>
