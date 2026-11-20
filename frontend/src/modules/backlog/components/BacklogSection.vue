<script setup lang="ts">
import { ChevronRight, GripVertical } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { type SortableEvent, VueDraggable } from 'vue-draggable-plus'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useDevice } from '@/composables/useDevice'
import { formatDate } from '@/lib/format'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import IssueRow from '@/modules/issues/components/IssueRow.vue'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import type { Issue, Sprint } from '@/types/models'

const props = withDefaults(
  defineProps<{
    sectionKey: string
    title: string
    projectId: string
    sprint?: Sprint | null
    moveTargets: Array<{ key: string; label: string }>
    editable?: boolean
    /** Start collapsed (useful for completed sprints). */
    startCollapsed?: boolean
    /** Horizontal planning board column vs stacked list. */
    variant?: 'stack' | 'column'
    isSelected: (id: string) => boolean
  }>(),
  { sprint: null, editable: true, startCollapsed: false, variant: 'stack' },
)
const issues = defineModel<Issue[]>({ required: true })
const emit = defineEmits<{
  open: [issue: Issue]
  toggleSelect: [issue: Issue]
  dragStart: []
  dragEnd: [event: SortableEvent]
  moveTo: [issue: Issue, targetKey: string]
}>()

const { isWide } = useDevice()
const isCollapsed = ref(props.variant === 'column' ? false : props.startCollapsed)

const points = computed(() => issues.value.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0))
const STATE_BADGE = { active: 'success', planned: 'secondary', completed: 'outline' } as const
</script>

<template>
  <section
    class="overflow-hidden border bg-card"
    :class="variant === 'column' ? 'flex h-full min-h-[24rem] flex-col rounded-xl' : 'rounded-xl'"
    :aria-label="title"
  >
    <header class="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
      <button
        v-if="variant === 'stack'"
        type="button"
        class="flex min-w-0 items-center gap-2 text-left"
        :aria-expanded="!isCollapsed"
        @click="isCollapsed = !isCollapsed"
      >
        <ChevronRight class="size-4 shrink-0 transition-transform" :class="!isCollapsed && 'rotate-90'" />
        <h2 class="truncate text-sm font-semibold">{{ title }}</h2>
      </button>
      <h2 v-else class="truncate text-sm font-semibold">{{ title }}</h2>
      <Badge v-if="sprint" :variant="STATE_BADGE[sprint.state]" class="capitalize">{{ sprint.state }}</Badge>
      <span v-if="sprint?.startDate && variant === 'stack'" class="text-xs text-muted-foreground">
        {{ formatDate(sprint.startDate, 'd MMM') }} – {{ formatDate(sprint.endDate, 'd MMM') }}
      </span>
      <span class="text-xs text-muted-foreground">{{ issues.length }} tasks<template v-if="points"> · {{ points }} pts</template></span>
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
      </div>
      <p v-if="sprint?.goal" class="basis-full pl-6 text-xs text-muted-foreground">{{ sprint.goal }}</p>
    </header>

    <div v-show="!isCollapsed" :class="variant === 'column' ? 'flex min-h-0 flex-1 flex-col' : ''">
      <VueDraggable
        v-model="issues"
        group="backlog"
        :animation="150"
        :disabled="!editable"
        handle=".drag-handle"
        ghost-class="opacity-40"
        :delay="isWide ? 0 : 180"
        :delay-on-touch-only="true"
        :data-section-key="sectionKey"
        class="min-h-10"
        :class="[
          (variant === 'column' || !isWide) && 'space-y-2 p-2',
          variant === 'column' && 'min-h-0 flex-1 overflow-y-auto',
        ]"
        @start="emit('dragStart')"
        @end="(event: SortableEvent) => emit('dragEnd', event)"
      >
        <template v-if="isWide && variant === 'stack'">
          <IssueRow
            v-for="issue in issues"
            :key="issue.id"
            :issue="issue"
            selectable
            :draggable="editable"
            :selected="isSelected(issue.id)"
            @open="emit('open', issue)"
            @toggle-select="emit('toggleSelect', issue)"
          />
        </template>
        <template v-else>
          <div v-for="issue in issues" :key="issue.id" class="relative" :data-issue-id="issue.id">
            <button
              v-if="editable"
              type="button"
              class="drag-handle absolute top-1.5 left-1.5 z-10 rounded-md border border-border bg-card/95 p-1 text-muted-foreground shadow-soft"
              aria-label="Drag to reorder or move"
              @click.stop
            >
              <GripVertical class="size-4" />
            </button>
            <IssueCard :issue="issue" show-status class="pl-9" @open="emit('open', issue)" />
            <DropdownMenu v-if="editable && moveTargets.length">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="xs" class="absolute top-1.5 right-1.5 bg-card/90">Move</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move {{ issue.key }} to</DropdownMenuLabel>
                <DropdownMenuItem v-for="target in moveTargets.filter((item) => item.key !== sectionKey)" :key="target.key" @select="emit('moveTo', issue, target.key)">
                  {{ target.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </template>
      </VueDraggable>
      <p v-if="!issues.length" class="px-4 py-3 text-center text-xs text-muted-foreground">
        <template v-if="!editable">No tasks remaining on this sprint.</template>
        <template v-else>Drag tasks here or add one below.</template>
      </p>
      <div v-if="editable" class="shrink-0 border-t p-2">
        <QuickAddInput :project-id="projectId" :defaults="{ sprintId: sprint?.id ?? null }" placeholder="Add to this list…" />
      </div>
    </div>
  </section>
</template>
