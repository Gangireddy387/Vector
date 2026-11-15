<script setup lang="ts">
import { AlarmClock, Check, CircleUserRound, History, Search, TriangleAlert, X } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown from '@/components/common/FilterDropdown.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ISSUE_TYPE_META, PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { IssueType, Label, UserSummary } from '@/types/models'

/** One-click filters, like Jira's quick filters. */
export type BoardQuickFilter = 'mine' | 'dueSoon' | 'overdue' | 'recent'

export interface BoardFilterState {
  search: string
  assigneeIds: string[]
  types?: string
  priorities?: string
  labelIds?: string
  quick?: BoardQuickFilter[]
}

const props = withDefaults(defineProps<{ members: UserSummary[]; labels: Label[]; stacked?: boolean; hideSearch?: boolean }>(), {
  stacked: false,
  hideSearch: false,
})
const filters = defineModel<BoardFilterState>({ required: true })

const SELECTED_TICK_CLASS =
  'pointer-events-none absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background'
const AVATAR_LIMIT = 6

const QUICK_FILTERS: Array<{ value: BoardQuickFilter; label: string; icon: typeof Check }> = [
  { value: 'mine', label: 'My tasks', icon: CircleUserRound },
  { value: 'dueSoon', label: 'Due this week', icon: AlarmClock },
  { value: 'overdue', label: 'Overdue', icon: TriangleAlert },
  { value: 'recent', label: 'Updated today', icon: History },
]

const BOARD_TYPES: IssueType[] = ['story', 'task', 'bug', 'subtask']
const typeOptions = BOARD_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, color: ISSUE_TYPE_META[type].color }))
const priorityOptions = PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_META[priority].label, color: PRIORITY_META[priority].color }))
const labelOptions = computed(() => props.labels.map((label) => ({ value: label.id, label: label.name, color: label.color })))
const shownMembers = computed(() => props.members.slice(0, AVATAR_LIMIT))
const hiddenMembers = computed(() => Math.max(0, props.members.length - AVATAR_LIMIT))
const hasFilters = computed(
  () =>
    Boolean(filters.value.search || filters.value.assigneeIds.length || filters.value.types || filters.value.priorities || filters.value.labelIds || filters.value.quick?.length),
)

function toggleAssignee(id: string) {
  const ids = filters.value.assigneeIds
  filters.value = { ...filters.value, assigneeIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] }
}
function toggleQuick(value: BoardQuickFilter) {
  const quick = filters.value.quick ?? []
  filters.value = { ...filters.value, quick: quick.includes(value) ? quick.filter((item) => item !== value) : [...quick, value] }
}
function clearFilters() {
  filters.value = { search: props.hideSearch ? filters.value.search : '', assigneeIds: [] }
}
</script>

<template>
  <div :class="stacked ? 'space-y-4' : 'flex min-w-0 flex-wrap items-center gap-2'">
    <div v-if="!hideSearch" class="relative" :class="stacked ? 'w-full' : 'w-56'">
      <Search class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="filters.search" placeholder="Search this board" class="h-8 pl-8" aria-label="Search this board" />
    </div>

    <div>
      <p v-if="stacked" class="mb-2 text-xs font-medium text-muted-foreground">Assignee</p>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center -space-x-1.5" role="group" aria-label="Filter by assignee">
          <button
            v-for="member in shownMembers"
            :key="member.id"
            type="button"
            class="relative rounded-full ring-2 transition"
            :class="filters.assigneeIds.includes(member.id) ? 'z-10 ring-primary' : 'ring-background hover:z-10 hover:-translate-y-0.5'"
            :aria-pressed="filters.assigneeIds.includes(member.id)"
            :aria-label="`Only ${member.name}`"
            @click="toggleAssignee(member.id)"
          >
            <UserAvatar :user="member" size="md" show-tooltip />
            <span v-if="filters.assigneeIds.includes(member.id)" :class="SELECTED_TICK_CLASS" aria-hidden="true">
              <Check class="size-2.5" stroke-width="3.5" />
            </span>
          </button>
          <span
            v-if="hiddenMembers"
            class="relative flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-background"
            :title="members.slice(AVATAR_LIMIT).map((member) => member.name).join(', ')"
          >
            +{{ hiddenMembers }}
          </span>
          <button
            type="button"
            class="relative rounded-full ring-2 transition"
            :class="filters.assigneeIds.includes('unassigned') ? 'z-10 ring-primary' : 'ring-background hover:z-10 hover:-translate-y-0.5'"
            :aria-pressed="filters.assigneeIds.includes('unassigned')"
            aria-label="Only unassigned"
            @click="toggleAssignee('unassigned')"
          >
            <UserAvatar :user="null" size="md" show-tooltip />
            <span v-if="filters.assigneeIds.includes('unassigned')" :class="SELECTED_TICK_CLASS" aria-hidden="true">
              <Check class="size-2.5" stroke-width="3.5" />
            </span>
          </button>
        </div>
      </div>
    </div>

    <span v-if="!stacked" class="mx-0.5 hidden h-5 w-px bg-border lg:block" />

    <div>
      <p v-if="stacked" class="mb-2 text-xs font-medium text-muted-foreground">Quick filters</p>
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
        <button
          v-for="option in QUICK_FILTERS"
          :key="option.value"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
          :class="
            filters.quick?.includes(option.value)
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground hover:border-input hover:text-foreground'
          "
          :aria-pressed="filters.quick?.includes(option.value) ?? false"
          @click="toggleQuick(option.value)"
        >
          <component :is="option.icon" class="size-3.5" /> {{ option.label }}
        </button>
      </div>
    </div>

    <div>
      <p v-if="stacked" class="mb-2 text-xs font-medium text-muted-foreground">More</p>
      <div class="flex flex-wrap items-center gap-1.5">
        <FilterDropdown v-model="filters.types" label="Type" :options="typeOptions" />
        <FilterDropdown v-model="filters.priorities" label="Priority" :options="priorityOptions" />
        <FilterDropdown v-if="labelOptions.length" v-model="filters.labelIds" label="Label" :options="labelOptions" />
        <Button v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters"><X /> Clear</Button>
      </div>
    </div>
  </div>
</template>
