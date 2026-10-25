<script setup lang="ts">
import { CalendarCheck, Columns3 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { SortableEvent } from 'vue-draggable-plus'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { rankBetween } from '@/lib/utils'
import { issuesApi } from '@/modules/issues/api/issues.api'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import CompleteSprintDialog from '@/modules/sprints/components/CompleteSprintDialog.vue'
import SprintProgress from '@/modules/sprints/components/SprintProgress.vue'
import type { Issue, Status } from '@/types/models'
import BoardColumn from '../components/BoardColumn.vue'
import BoardFilters, { type BoardFilterState } from '../components/BoardFilters.vue'
import MobileBoard from '../components/MobileBoard.vue'
import { useBoardData } from '../composables/useBoardData'

const route = useRoute()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const { project, issues, sprints, activeSprint, isScrum, isLoading, isDragging, reload } = useBoardData(projectId)

const canEdit = computed(() => projects.canEdit(projectId.value))
const filters = ref<BoardFilterState>({ search: '', assigneeIds: [] })
const columns = ref<Record<string, Issue[]>>({})
const isCompleteOpen = ref(false)

const filteredIssues = computed(() => {
  const term = filters.value.search.trim().toLowerCase()
  const types = filters.value.types?.split(',')
  const priorities = filters.value.priorities?.split(',')
  const labelIds = filters.value.labelIds?.split(',')
  const assignees = filters.value.assigneeIds
  return issues.value.filter(
    (issue) =>
      (!term || issue.title.toLowerCase().includes(term) || issue.key.toLowerCase().includes(term)) &&
      (!assignees.length || assignees.includes(issue.assigneeId ?? 'unassigned')) &&
      (!types || types.includes(issue.type)) &&
      (!priorities || priorities.includes(issue.priority)) &&
      (!labelIds || issue.labels.some((label) => labelIds.includes(label.id))),
  )
})

function rebuildColumns() {
  const next: Record<string, Issue[]> = {}
  for (const status of project.value?.statuses ?? []) {
    next[status.id] = filteredIssues.value.filter((issue) => issue.statusId === status.id).sort((a, b) => a.position - b.position)
  }
  columns.value = next
}
watch([filteredIssues, () => project.value?.statuses], rebuildColumns, { immediate: true })

const sprintStats = computed(() => {
  const done = issues.value.filter((issue) => issue.status.category === 'done')
  return {
    issueCount: issues.value.length,
    doneCount: done.length,
    totalPoints: issues.value.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
    donePoints: done.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
  }
})

async function persistMove(issue: Issue, status: Status, position: number) {
  const previous = { statusId: issue.statusId, status: issue.status, position: issue.position }
  Object.assign(issue, { statusId: status.id, status, position })
  rebuildColumns()
  try {
    await issuesApi.move(issue.id, { statusId: status.id, position })
  } catch (error) {
    Object.assign(issue, previous)
    rebuildColumns()
    toast.error(getErrorMessage(error))
  }
}

async function onDragEnd(event: SortableEvent) {
  isDragging.value = false
  const issueId = (event.item as HTMLElement).dataset.issueId
  const statusId = (event.to.closest('[data-status-id]') as HTMLElement | null)?.dataset.statusId
  const status = project.value?.statuses.find((item) => item.id === statusId)
  const issue = issues.value.find((item) => item.id === issueId)
  if (!issue || !status || !statusId) return

  const list = columns.value[statusId] ?? []
  const index = list.findIndex((item) => item.id === issueId)
  const position = rankBetween(list[index - 1]?.position, list[index + 1]?.position)
  if (issue.statusId === statusId && issue.position === position) return
  await persistMove(issue, status, position)
}

function moveOnMobile(issue: Issue, status: Status) {
  const lastInColumn = issues.value.filter((item) => item.statusId === status.id).at(-1)
  void persistMove(issue, status, rankBetween(lastInColumn?.position, null))
  toast.success(`${issue.key} moved to ${status.name}`)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" :class="isDesktop ? '' : 'p-3'">
    <div v-if="isLoading" class="flex gap-3 p-4">
      <Skeleton v-for="index in 4" :key="index" class="h-96 min-w-56 flex-1" />
    </div>

    <EmptyState
      v-else-if="isScrum && !activeSprint"
      :icon="CalendarCheck"
      title="No active sprint"
      description="Plan a sprint in the backlog and start it to see its board here."
      class="py-20"
    >
      <Button as-child>
        <RouterLink :to="{ name: 'project-backlog', params: { projectId } }">Go to backlog</RouterLink>
      </Button>
    </EmptyState>

    <template v-else-if="project">
      <!-- Desktop: full workflow at a glance -->
      <template v-if="isDesktop">
        <div v-if="activeSprint" class="flex items-center gap-4 border-b px-5 py-2">
          <p class="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
            <span class="shrink-0 font-semibold">{{ activeSprint.name }}</span>
            <span v-if="activeSprint.goal" class="truncate text-xs text-muted-foreground">{{ activeSprint.goal }}</span>
          </p>
          <div class="hidden xl:block"><SprintProgress :sprint="activeSprint" :stats="sprintStats" inline /></div>
          <Button v-if="canEdit" variant="outline" size="sm" @click="isCompleteOpen = true">Complete sprint</Button>
        </div>
        <div class="border-b px-5 py-2">
          <BoardFilters v-model="filters" :members="project.members" :labels="project.labels" />
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-5 pb-4 scrollbar-thin">
          <div class="flex min-h-full gap-3 pt-4">
            <BoardColumn
              v-for="status in project.statuses"
              :key="status.id"
              v-model="columns[status.id]"
              :status="status"
              :project-id="projectId"
              :sprint-id="activeSprint?.id ?? null"
              :editable="canEdit"
              @open="openIssue"
              @drag-start="isDragging = true"
              @drag-end="onDragEnd"
            />
            <EmptyState v-if="!project.statuses.length" :icon="Columns3" title="No workflow statuses" class="w-full" />
          </div>
        </div>
      </template>

      <!-- Mobile: one status at a time, tap to move -->
      <template v-else>
        <div v-if="activeSprint" class="mb-3 border bg-card p-3">
          <p class="mb-2 text-sm font-semibold">{{ activeSprint.name }}</p>
          <SprintProgress :sprint="activeSprint" :stats="sprintStats" />
        </div>
        <MobileBoard
          :statuses="project.statuses"
          :issues="issues"
          :project-id="projectId"
          :sprint-id="activeSprint?.id ?? null"
          :editable="canEdit"
          @open="openIssue"
          @move="moveOnMobile"
        />
      </template>

      <CompleteSprintDialog
        v-model:open="isCompleteOpen"
        :project-id="projectId"
        :sprint="activeSprint ? { ...activeSprint, stats: sprintStats } : null"
        :sprints="sprints"
        :carry-over-by-default="project.settings.carryOverIncomplete"
        @completed="reload"
      />
    </template>
  </div>
</template>
