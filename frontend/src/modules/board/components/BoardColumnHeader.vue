<script setup lang="ts">
import { ChevronsRightLeft, Ellipsis, Plus, Settings2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Status } from '@/types/models'

/** A column's header: status, how many tasks (against its WIP limit), points, add and collapse. */
const props = defineProps<{ status: Status; count: number; points: number; collapsed: boolean; editable: boolean; canConfigure: boolean; projectId: string }>()
const emit = defineEmits<{ toggle: []; add: [] }>()

const isOverLimit = computed(() => props.status.wipLimit !== null && props.count > props.status.wipLimit)
const limitLabel = computed(() => (props.status.wipLimit !== null ? `${props.count} / ${props.status.wipLimit}` : String(props.count)))
</script>

<template>
  <!-- Collapsed: a slim vertical strip -->
  <button
    v-if="collapsed"
    type="button"
    class="flex h-full min-h-40 w-full flex-col items-center gap-3 rounded-xl bg-muted/50 py-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:bg-muted/35"
    :aria-label="`Expand ${status.name} (${count})`"
    :title="`Expand ${status.name}`"
    @click="emit('toggle')"
  >
    <span class="size-2.5 shrink-0 rounded-full ring-[3px]" :style="{ backgroundColor: status.color, '--tw-ring-color': `${status.color}2e` }" />
    <span class="rounded-full bg-background px-1.5 text-[11px] font-semibold tabular-nums" :class="isOverLimit && 'text-destructive'">{{ count }}</span>
    <span class="text-[12.5px] font-medium [writing-mode:vertical-rl]">{{ status.name }}</span>
  </button>

  <div
    v-else
    class="group/header flex h-11 items-center gap-2 rounded-xl px-3"
    :class="isOverLimit ? 'bg-destructive/10 ring-1 ring-destructive/30' : 'bg-muted/50 dark:bg-muted/35'"
  >
    <span class="size-2.5 shrink-0 rounded-full ring-[3px]" :style="{ backgroundColor: status.color, '--tw-ring-color': `${status.color}2e` }" />
    <h2 class="min-w-0 truncate text-[13px] font-semibold">{{ status.name }}</h2>
    <span
      class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
      :class="isOverLimit ? 'bg-destructive text-white' : 'bg-background text-muted-foreground'"
      :title="status.wipLimit !== null ? (isOverLimit ? 'Over the WIP limit: finish work before starting more' : `WIP limit ${status.wipLimit}`) : `${count} tasks`"
    >
      {{ limitLabel }}
    </span>
    <span v-if="points" class="text-[11px] text-muted-foreground tabular-nums" title="Story points">{{ points }} pts</span>

    <span class="ml-auto flex items-center opacity-100 transition-opacity sm:opacity-60 sm:group-hover/header:opacity-100 sm:focus-within:opacity-100">
      <Button v-if="editable" variant="ghost" size="icon-sm" class="size-7" :aria-label="`Add a task to ${status.name}`" title="Add a task" @click="emit('add')"><Plus /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="size-7" :aria-label="`${status.name} options`" title="Column options"><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <DropdownMenuItem v-if="editable" @select="emit('add')"><Plus /> Add a task</DropdownMenuItem>
          <DropdownMenuItem @select="emit('toggle')"><ChevronsRightLeft /> Collapse column</DropdownMenuItem>
          <template v-if="canConfigure">
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="$router.push({ name: 'project-settings', params: { projectId } })"><Settings2 /> Edit workflow and WIP limits</DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  </div>
</template>
