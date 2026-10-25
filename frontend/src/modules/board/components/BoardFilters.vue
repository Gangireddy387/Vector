<script setup lang="ts">
import { Check, Search, X } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown from '@/components/common/FilterDropdown.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ISSUE_TYPE_META, PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { IssueType, Label, UserSummary } from '@/types/models'

export interface BoardFilterState {
  search: string
  assigneeIds: string[]
  types?: string
  priorities?: string
  labelIds?: string
}

const props = defineProps<{ members: UserSummary[]; labels: Label[] }>()
const filters = defineModel<BoardFilterState>({ required: true })

const SELECTED_TICK_CLASS =
  'pointer-events-none absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background'

const BOARD_TYPES: IssueType[] = ['story', 'task', 'bug', 'subtask']
const typeOptions = BOARD_TYPES.map((type) => ({ value: type, label: ISSUE_TYPE_META[type].label, color: ISSUE_TYPE_META[type].color }))
const priorityOptions = PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_META[priority].label, color: PRIORITY_META[priority].color }))
const labelOptions = computed(() => props.labels.map((label) => ({ value: label.id, label: label.name, color: label.color })))
const hasFilters = computed(
  () => Boolean(filters.value.search || filters.value.assigneeIds.length || filters.value.types || filters.value.priorities || filters.value.labelIds),
)

function toggleAssignee(id: string) {
  const ids = filters.value.assigneeIds
  filters.value = { ...filters.value, assigneeIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative w-52">
      <Search class="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="filters.search" placeholder="Filter board" class="h-8 pl-8" aria-label="Filter board" />
    </div>
    <div class="flex items-center -space-x-1" role="group" aria-label="Filter by assignee">
      <button
        v-for="member in members"
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
    <FilterDropdown v-model="filters.types" label="Type" :options="typeOptions" />
    <FilterDropdown v-model="filters.priorities" label="Priority" :options="priorityOptions" />
    <FilterDropdown v-if="labelOptions.length" v-model="filters.labelIds" label="Label" :options="labelOptions" />
    <Button v-if="hasFilters" variant="ghost" size="sm" @click="filters = { search: '', assigneeIds: [] }"><X /> Clear</Button>
  </div>
</template>
