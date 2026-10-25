<script setup lang="ts">
import { Trash2, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { PRIORITIES, PRIORITY_META } from '@/constants/issue'
import type { Label, Sprint, Status, UserSummary } from '@/types/models'
import type { BulkChanges } from '../api/issues.api'

withDefaults(
  defineProps<{ count: number; members: UserSummary[]; statuses?: Status[]; sprints?: Sprint[]; labels?: Label[]; busy?: boolean }>(),
  { statuses: () => [], sprints: () => [], labels: () => [], busy: false },
)
const emit = defineEmits<{ apply: [changes: BulkChanges]; delete: []; clear: [] }>()
</script>

<template>
  <div
    v-if="count"
    class="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 border bg-popover p-2 shadow-xl lg:bottom-6"
    role="toolbar"
    aria-label="Bulk actions"
  >
    <span class="px-2 text-sm font-medium">{{ count }} selected</span>

    <DropdownMenu v-if="statuses.length">
      <DropdownMenuTrigger as-child><Button size="sm" variant="outline" :disabled="busy">Status</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem v-for="status in statuses" :key="status.id" @select="emit('apply', { statusId: status.id })">
          <span class="size-2 rounded-full" :style="{ backgroundColor: status.color }" /> {{ status.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu>
      <DropdownMenuTrigger as-child><Button size="sm" variant="outline" :disabled="busy">Assignee</Button></DropdownMenuTrigger>
      <DropdownMenuContent class="max-h-72">
        <DropdownMenuItem @select="emit('apply', { assigneeId: null })"><UserAvatar :user="null" size="xs" /> Unassigned</DropdownMenuItem>
        <DropdownMenuItem v-for="member in members" :key="member.id" @select="emit('apply', { assigneeId: member.id })">
          <UserAvatar :user="member" size="xs" /> {{ member.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu>
      <DropdownMenuTrigger as-child><Button size="sm" variant="outline" :disabled="busy">Priority</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem v-for="priority in PRIORITIES" :key="priority" @select="emit('apply', { priority })">
          <PriorityIcon :priority="priority" /> {{ PRIORITY_META[priority].label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu v-if="sprints.length">
      <DropdownMenuTrigger as-child><Button size="sm" variant="outline" :disabled="busy">Sprint</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem @select="emit('apply', { sprintId: null })">Backlog</DropdownMenuItem>
        <DropdownMenuItem
          v-for="sprint in sprints.filter((item) => item.state !== 'completed')"
          :key="sprint.id"
          @select="emit('apply', { sprintId: sprint.id })"
        >
          {{ sprint.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu v-if="labels.length">
      <DropdownMenuTrigger as-child><Button size="sm" variant="outline" :disabled="busy">Add label</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Add label</DropdownMenuLabel>
        <DropdownMenuItem v-for="label in labels" :key="label.id" @select="emit('apply', { addLabelIds: [label.id] })">
          <span class="size-2 rounded-full" :style="{ backgroundColor: label.color }" /> {{ label.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :disabled="busy" @click="emit('delete')"><Trash2 /> Delete</Button>
    <Button size="icon-sm" variant="ghost" class="ml-auto" aria-label="Clear selection" @click="emit('clear')"><X /></Button>
  </div>
</template>
