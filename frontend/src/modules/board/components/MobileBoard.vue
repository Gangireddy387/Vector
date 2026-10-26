<script setup lang="ts">
import { ArrowRight, Inbox } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueCard from '@/modules/issues/components/IssueCard.vue'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import type { Issue, Status } from '@/types/models'

const props = withDefaults(
  defineProps<{ statuses: Status[]; issues: Issue[]; projectId: string; sprintId?: string | null; editable?: boolean }>(),
  { sprintId: null, editable: true },
)
const emit = defineEmits<{ open: [issue: Issue]; move: [issue: Issue, status: Status] }>()

const auth = useAuthStore()
const selectedStatusId = ref(props.statuses[0]?.id ?? '')
const onlyMine = ref(false)

watch(
  () => props.statuses,
  (statuses) => {
    if (!statuses.some((status) => status.id === selectedStatusId.value)) selectedStatusId.value = statuses[0]?.id ?? ''
  },
)

const scoped = computed(() => (onlyMine.value ? props.issues.filter((issue) => issue.assigneeId === auth.user?.id) : props.issues))
const countFor = (statusId: string) => scoped.value.filter((issue) => issue.statusId === statusId).length
const visible = computed(() => scoped.value.filter((issue) => issue.statusId === selectedStatusId.value))
const selectedIndex = computed(() => props.statuses.findIndex((status) => status.id === selectedStatusId.value))
const nextStatus = computed(() => props.statuses[selectedIndex.value + 1] ?? null)
</script>

<template>
  <div class="space-y-3">
    <div class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-none" role="tablist" aria-label="Statuses">
      <button
        v-for="status in statuses"
        :key="status.id"
        type="button"
        role="tab"
        :aria-selected="status.id === selectedStatusId"
        class="flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition-colors"
        :class="status.id === selectedStatusId ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'"
        @click="selectedStatusId = status.id"
      >
        <span class="size-2 rounded-full" :style="{ backgroundColor: status.id === selectedStatusId ? 'currentColor' : status.color }" />
        {{ status.name }}
        <span class="text-xs opacity-80">{{ countFor(status.id) }}</span>
      </button>
    </div>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 text-sm">
        <Switch v-model="onlyMine" aria-label="Only my tasks" />
        Only my tasks
      </div>
    </div>

    <QuickAddInput v-if="editable" :project-id="projectId" :defaults="{ statusId: selectedStatusId, sprintId }" placeholder="Add to this column…" />

    <EmptyState v-if="!visible.length" :icon="Inbox" title="Nothing here" description="Tasks in this status will show up here." class="py-10" />

    <ul class="space-y-2">
      <li v-for="issue in visible" :key="issue.id" class="overflow-hidden border bg-card">
        <IssueCard :issue="issue" class=" border-0 shadow-none" @open="emit('open', issue)" />
        <div v-if="editable" class="flex items-center justify-end gap-1 border-t bg-muted/30 px-2 py-1">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="xs">Move to…</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
          <Button v-if="nextStatus" variant="secondary" size="xs" @click="emit('move', issue, nextStatus)">
            {{ nextStatus.name }} <ArrowRight />
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>
