<script setup lang="ts">
import type { SortableEvent } from 'vue-draggable-plus'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Ellipsis } from 'lucide-vue-next'
import type { Issue, Sprint } from '@/types/models'
import BacklogSection from './BacklogSection.vue'

const BACKLOG_KEY = 'backlog'

defineProps<{
  projectId: string
  openSprints: Sprint[]
  moveTargets: Array<{ key: string; label: string }>
  editable: boolean
  canManageSprints: boolean
  hasActiveSprint: boolean
  isProjectAdmin: boolean
  isSelected: (id: string) => boolean
}>()

const lists = defineModel<Record<string, Issue[]>>('lists', { required: true })

const emit = defineEmits<{
  open: [issue: Issue]
  toggleSelect: [issue: Issue]
  dragStart: []
  dragEnd: [event: SortableEvent]
  moveTo: [issue: Issue, targetKey: string]
  startSprint: [sprint: Sprint]
  completeSprint: [sprint: Sprint]
  editSprint: [sprint: Sprint]
  deleteSprint: [sprint: Sprint]
}>()
</script>

<template>
  <div class="flex min-h-[28rem] gap-3 overflow-x-auto overscroll-x-contain pb-2">
    <div class="flex w-[min(20rem,85vw)] shrink-0 flex-col">
      <BacklogSection
        v-model="lists[BACKLOG_KEY]"
        variant="column"
        :section-key="BACKLOG_KEY"
        title="Backlog"
        :project-id="projectId"
        :move-targets="moveTargets"
        :editable="editable"
        :is-selected="isSelected"
        @open="emit('open', $event)"
        @toggle-select="emit('toggleSelect', $event)"
        @drag-start="emit('dragStart')"
        @drag-end="emit('dragEnd', $event)"
        @move-to="(issue, key) => emit('moveTo', issue, key)"
      />
    </div>

    <div
      v-for="sprint in openSprints"
      :key="sprint.id"
      class="flex w-[min(20rem,85vw)] shrink-0 flex-col"
    >
      <BacklogSection
        v-model="lists[sprint.id]"
        variant="column"
        :section-key="sprint.id"
        :title="sprint.name"
        :sprint="sprint"
        :project-id="projectId"
        :move-targets="moveTargets"
        :editable="editable"
        :is-selected="isSelected"
        @open="emit('open', $event)"
        @toggle-select="emit('toggleSelect', $event)"
        @drag-start="emit('dragStart')"
        @drag-end="emit('dragEnd', $event)"
        @move-to="(issue, key) => emit('moveTo', issue, key)"
      >
        <template v-if="canManageSprints" #actions>
          <Button
            v-if="sprint.state === 'planned' && !hasActiveSprint"
            size="xs"
            @click="emit('startSprint', sprint)"
          >
            Start
          </Button>
          <Button
            v-if="sprint.state === 'active'"
            size="xs"
            variant="outline"
            @click="emit('completeSprint', sprint)"
          >
            Complete
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon-sm" :aria-label="`${sprint.name} actions`">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="emit('editSprint', sprint)">Edit sprint</DropdownMenuItem>
              <DropdownMenuItem
                v-if="sprint.state !== 'active' && isProjectAdmin"
                variant="destructive"
                @select="emit('deleteSprint', sprint)"
              >
                Delete sprint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </BacklogSection>
    </div>
  </div>
</template>
