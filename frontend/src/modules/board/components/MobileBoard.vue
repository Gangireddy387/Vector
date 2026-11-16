<script setup lang="ts">
import { useSwipe } from '@vueuse/core'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import type { Issue, Status } from '@/types/models'

const props = withDefaults(
  defineProps<{ statuses: Status[]; issues: Issue[]; projectId: string; sprintId?: string | null; editable?: boolean }>(),
  { sprintId: null, editable: true },
)
const emit = defineEmits<{ open: [issue: Issue]; move: [issue: Issue, status: Status] }>()

const selectedIndex = ref(0)
const pane = ref<HTMLElement | null>(null)

watch(
  () => props.statuses,
  (statuses) => {
    if (!statuses.length) {
      selectedIndex.value = 0
      return
    }
    if (selectedIndex.value >= statuses.length) selectedIndex.value = statuses.length - 1
  },
)

const selectedStatus = computed(() => props.statuses[selectedIndex.value] ?? null)
const visible = computed(() =>
  selectedStatus.value ? props.issues.filter((issue) => issue.statusId === selectedStatus.value!.id) : [],
)
const nextColumn = computed(() => props.statuses[selectedIndex.value + 1] ?? null)
const canPrev = computed(() => selectedIndex.value > 0)
const canNext = computed(() => selectedIndex.value < props.statuses.length - 1)
const countFor = (statusId: string) => props.issues.filter((issue) => issue.statusId === statusId).length

function goPrev() {
  if (canPrev.value) selectedIndex.value -= 1
}
function goNext() {
  if (canNext.value) selectedIndex.value += 1
}
function goTo(index: number) {
  if (index >= 0 && index < props.statuses.length) selectedIndex.value = index
}

useSwipe(pane, {
  threshold: 56,
  passive: true,
  onSwipeEnd(_e, direction) {
    if (direction === 'left') goNext()
    else if (direction === 'right') goPrev()
  },
})
</script>

<template>
  <!-- Natural page scroll on phone — no nested column scrollbar -->
  <div ref="pane" class="flex w-full min-w-0 flex-col touch-pan-y">
    <div class="border-b border-border bg-background px-2 py-2">
      <div class="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          :disabled="!canPrev"
          aria-label="Previous column"
          @click="goPrev"
        >
          <ChevronLeft class="size-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-center hover:bg-muted/70"
              aria-label="Choose column"
            >
              <span
                v-if="selectedStatus"
                class="size-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: selectedStatus.color }"
              />
              <span class="min-w-0 truncate text-[15px] font-semibold">{{ selectedStatus?.name ?? 'Column' }}</span>
              <span class="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {{ selectedStatus ? countFor(selectedStatus.id) : 0 }}
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" class="min-w-52">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="(status, index) in statuses"
              :key="status.id"
              class="justify-between gap-3"
              :class="index === selectedIndex && 'bg-accent'"
              @select="goTo(index)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: status.color }" />
                <span class="truncate">{{ status.name }}</span>
              </span>
              <span class="text-xs text-muted-foreground tabular-nums">{{ countFor(status.id) }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          :disabled="!canNext"
          aria-label="Next column"
          @click="goNext"
        >
          <ChevronRight class="size-5" />
        </Button>
      </div>

      <div v-if="statuses.length > 1" class="mt-1.5 flex items-center justify-center gap-1.5">
        <button
          v-for="(status, index) in statuses"
          :key="status.id"
          type="button"
          class="h-1.5 rounded-full transition-all"
          :class="index === selectedIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/35'"
          :aria-label="`Show ${status.name}`"
          :aria-current="index === selectedIndex ? 'true' : undefined"
          @click="goTo(index)"
        />
      </div>
    </div>

    <div class="px-3 py-3">
      <div class="mb-3">
        <QuickAddInput
          v-if="editable && selectedStatus"
          :project-id="projectId"
          :defaults="{ statusId: selectedStatus.id, sprintId }"
          :placeholder="`Add to ${selectedStatus.name}…`"
        />
      </div>

      <EmptyState
        v-if="!visible.length"
        :icon="Inbox"
        title="Nothing here"
        description="Tasks in this status will show up here."
        class="py-12"
      />

      <ul v-else class="space-y-2">
        <li v-for="issue in visible" :key="issue.id" class="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <IssueCard :issue="issue" class="border-0 shadow-none" @open="emit('open', issue)" />
          <div v-if="editable" class="flex min-w-0 items-center justify-end gap-1.5 border-t border-border/70 bg-muted/25 px-2 py-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="xs" class="shrink-0">Move</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="min-w-44">
                <DropdownMenuLabel>Move {{ issue.key }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="status in statuses.filter((item) => item.id !== issue.statusId)"
                  :key="status.id"
                  @select="emit('move', issue, status)"
                >
                  <span class="size-2 rounded-full" :style="{ backgroundColor: status.color }" /> {{ status.name }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              v-if="nextColumn"
              variant="secondary"
              size="xs"
              class="min-w-0 max-w-[9.5rem] shrink"
              @click="emit('move', issue, nextColumn)"
            >
              <span class="truncate">{{ nextColumn.name }}</span>
              <ArrowRight class="size-3.5 shrink-0" />
            </Button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
