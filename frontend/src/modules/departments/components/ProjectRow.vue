<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useUiStore } from '@/stores/ui.store'
import type { TeamWork, WorkCounts } from '@/types/models'

/** One project as a clickable row: lead, task progress, and a quick "New task". Extra actions go in the `actions` slot. */
const props = defineProps<{ project: TeamWork['projects'][number] }>()
const router = useRouter()
const ui = useUiStore()

const percent = (counts: WorkCounts) => (counts.total ? Math.round((counts.done / counts.total) * 100) : 0)
const open = () => router.push({ name: 'project-board', params: { projectId: props.project.id } })
</script>

<template>
  <li class="group flex cursor-pointer flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/40" @click="open">
    <RouterLink
      :to="{ name: 'project-board', params: { projectId: project.id } }"
      class="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @click.stop
    >
      <span class="flex size-9 shrink-0 items-center justify-center text-xs font-bold text-white" :style="{ backgroundColor: project.color }">
        {{ project.key.slice(0, 3) }}
      </span>
      <span class="min-w-0">
        <span class="block truncate font-medium transition-colors group-hover:text-primary">{{ project.name }}</span>
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <template v-if="project.lead"><UserAvatar :user="project.lead" size="xs" /> {{ project.lead.name }}</template>
          <template v-else>No project lead</template>
        </span>
      </span>
    </RouterLink>
    <div class="w-full space-y-1 sm:w-56">
      <div class="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>{{ project.work.todo }} to do · {{ project.work.inProgress }} in progress</span>
        <span class="font-medium text-foreground">{{ percent(project.work) }}%</span>
      </div>
      <Progress :model-value="percent(project.work)" class="h-1.5" indicator-class="bg-success" />
      <p class="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{{ project.work.done }}/{{ project.work.total }} tasks done</span>
        <span v-if="project.work.overdue" class="font-medium text-destructive">{{ project.work.overdue }} overdue</span>
      </p>
    </div>
    <div class="flex cursor-default items-center gap-1" @click.stop>
      <Button variant="outline" size="sm" @click="ui.openCreateIssue({ projectId: project.id })"><Plus /> New task</Button>
      <slot name="actions" />
    </div>
  </li>
</template>
