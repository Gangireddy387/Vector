<script setup lang="ts">
import { Ellipsis, Plus, Zap } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { SortableEvent } from 'vue-draggable-plus'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { rankBetween } from '@/lib/utils'
import { issuesApi } from '@/modules/issues/api/issues.api'
import BulkActionBar from '@/modules/issues/components/BulkActionBar.vue'
import { useIssueSelection } from '@/modules/issues/composables/useIssueSelection'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import CompleteSprintDialog from '@/modules/sprints/components/CompleteSprintDialog.vue'
import SprintFormDialog from '@/modules/sprints/components/SprintFormDialog.vue'
import StartSprintDialog from '@/modules/sprints/components/StartSprintDialog.vue'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Issue, Sprint } from '@/types/models'
import BacklogSection from '../components/BacklogSection.vue'

const BACKLOG_KEY = 'backlog'

const route = useRoute()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value])
const canEdit = computed(() => projects.canEdit(projectId.value))

const issues = ref<Issue[]>([])
const epics = ref<Issue[]>([])
const sprints = ref<Sprint[]>([])
const lists = ref<Record<string, Issue[]>>({})
const isLoading = ref(true)
const isDragging = ref(false)
const showDone = ref(false)
const epicFilter = ref<string | null>(null)

const isSprintFormOpen = ref(false)
const editingSprint = ref<Sprint | null>(null)
const startingSprint = ref<Sprint | null>(null)
const completingSprint = ref<Sprint | null>(null)

const openSprints = computed(() => sprints.value.filter((sprint) => sprint.state !== 'completed'))
const hasActiveSprint = computed(() => sprints.value.some((sprint) => sprint.state === 'active'))
const moveTargets = computed(() => [
  ...openSprints.value.map((sprint) => ({ key: sprint.id, label: sprint.name })),
  { key: BACKLOG_KEY, label: 'Backlog' },
])

async function load() {
  if (isDragging.value) return
  const detail = await projects.fetchProject(projectId.value)
  if (detail.type !== 'scrum') {
    isLoading.value = false
    return
  }
  const [sprintList, result] = await Promise.all([
    sprintsApi.list(projectId.value),
    issuesApi.list({ projectId: projectId.value, sort: 'position', order: 'asc', limit: 1000 }),
  ])
  sprints.value = sprintList
  epics.value = result.issues.filter((issue) => issue.type === 'epic')
  issues.value = result.issues.filter((issue) => issue.type !== 'epic' && issue.type !== 'subtask')
  isLoading.value = false
}

const selection = useIssueSelection(load)

function rebuildLists() {
  const visible = issues.value.filter((issue) => !epicFilter.value || issue.parentId === epicFilter.value)
  const next: Record<string, Issue[]> = {}
  for (const sprint of openSprints.value) next[sprint.id] = visible.filter((issue) => issue.sprintId === sprint.id)
  next[BACKLOG_KEY] = visible.filter((issue) => !issue.sprintId && (showDone.value || issue.status.category !== 'done'))
  lists.value = next
}

watch([issues, sprints, showDone, epicFilter], rebuildLists)
watch(projectId, () => {
  isLoading.value = true
  void load()
}, { immediate: true })
useProjectRealtime(projectId, load)

async function moveIssue(issue: Issue, sectionKey: string, position: number) {
  const sprintId = sectionKey === BACKLOG_KEY ? null : sectionKey
  const previous = { sprintId: issue.sprintId, position: issue.position }
  Object.assign(issue, { sprintId, position })
  rebuildLists()
  try {
    await issuesApi.move(issue.id, { sprintId, position })
  } catch (error) {
    Object.assign(issue, previous)
    rebuildLists()
    toast.error(getErrorMessage(error))
  }
}

async function onDragEnd(event: SortableEvent) {
  isDragging.value = false
  const issueId = (event.item as HTMLElement).dataset.issueId
  const sectionKey = (event.to.closest('[data-section-key]') as HTMLElement | null)?.dataset.sectionKey
  const issue = issues.value.find((item) => item.id === issueId)
  if (!issue || !sectionKey) return
  const list = lists.value[sectionKey] ?? []
  const index = list.findIndex((item) => item.id === issueId)
  await moveIssue(issue, sectionKey, rankBetween(list[index - 1]?.position, list[index + 1]?.position))
}

function moveTo(issue: Issue, sectionKey: string) {
  const last = (lists.value[sectionKey] ?? []).at(-1)
  void moveIssue(issue, sectionKey, rankBetween(last?.position, null))
}

function openSprintForm(sprint: Sprint | null = null) {
  editingSprint.value = sprint
  isSprintFormOpen.value = true
}

async function deleteSprint(sprint: Sprint) {
  const confirmed = await confirm({
    title: `Delete ${sprint.name}?`,
    description: 'Its issues will move back to the backlog.',
    confirmLabel: 'Delete sprint',
    destructive: true,
  })
  if (!confirmed) return
  try {
    await sprintsApi.remove(projectId.value, sprint.id)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const isStartOpen = computed({ get: () => Boolean(startingSprint.value), set: (open) => !open && (startingSprint.value = null) })
const isCompleteOpen = computed({ get: () => Boolean(completingSprint.value), set: (open) => !open && (completingSprint.value = null) })
</script>

<template>
  <div class="space-y-4" :class="isDesktop ? 'px-5 py-4' : 'p-3'">
    <div v-if="isLoading" class="space-y-3">
      <Skeleton v-for="index in 3" :key="index" class="h-40 w-full" />
    </div>

    <EmptyState
      v-else-if="project?.type !== 'scrum'"
      title="Backlog is for scrum projects"
      description="Kanban projects plan work directly on the board."
    />

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <div v-if="epics.length" class="flex flex-wrap items-center gap-1.5">
          <span class="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Zap class="size-3.5" /> Epics</span>
          <Button size="xs" :variant="epicFilter === null ? 'secondary' : 'ghost'" @click="epicFilter = null">All</Button>
          <Button
            v-for="epic in epics"
            :key="epic.id"
            size="xs"
            :variant="epicFilter === epic.id ? 'secondary' : 'ghost'"
            class="max-w-48 truncate"
            @click="epicFilter = epicFilter === epic.id ? null : epic.id"
          >
            {{ epic.title }}
          </Button>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-muted-foreground"><Switch v-model="showDone" /> Show done</label>
          <Button v-if="canEdit" size="sm" variant="outline" @click="openSprintForm()"><Plus /> Create sprint</Button>
        </div>
      </div>

      <BacklogSection
        v-for="sprint in openSprints"
        :key="sprint.id"
        v-model="lists[sprint.id]"
        :section-key="sprint.id"
        :title="sprint.name"
        :sprint="sprint"
        :project-id="projectId"
        :move-targets="moveTargets"
        :editable="canEdit"
        :is-selected="selection.isSelected"
        @open="openIssue"
        @toggle-select="(issue) => selection.toggle(issue.id)"
        @drag-start="isDragging = true"
        @drag-end="onDragEnd"
        @move-to="moveTo"
      >
        <template v-if="canEdit" #actions>
          <Button v-if="sprint.state === 'planned' && !hasActiveSprint" size="xs" @click="startingSprint = sprint">Start sprint</Button>
          <Button v-if="sprint.state === 'active'" size="xs" variant="outline" @click="completingSprint = sprint">Complete sprint</Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon-sm" :aria-label="`${sprint.name} actions`"><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="openSprintForm(sprint)">Edit sprint</DropdownMenuItem>
              <DropdownMenuItem v-if="sprint.state !== 'active'" variant="destructive" @select="deleteSprint(sprint)">Delete sprint</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </BacklogSection>

      <BacklogSection
        v-model="lists[BACKLOG_KEY]"
        :section-key="BACKLOG_KEY"
        title="Backlog"
        :project-id="projectId"
        :move-targets="moveTargets"
        :editable="canEdit"
        :is-selected="selection.isSelected"
        @open="openIssue"
        @toggle-select="(issue) => selection.toggle(issue.id)"
        @drag-start="isDragging = true"
        @drag-end="onDragEnd"
        @move-to="moveTo"
      />

      <BulkActionBar
        :count="selection.count.value"
        :members="project.members"
        :statuses="project.statuses"
        :sprints="sprints"
        :labels="project.labels"
        :busy="selection.isBusy.value"
        @apply="selection.apply"
        @delete="selection.removeSelected"
        @clear="selection.clear"
      />

      <SprintFormDialog v-model:open="isSprintFormOpen" :project-id="projectId" :sprint="editingSprint" @saved="load" />
      <StartSprintDialog
        v-model:open="isStartOpen"
        :project-id="projectId"
        :sprint="startingSprint"
        :sprint-length-days="project.settings.sprintLengthDays"
        @started="load"
      />
      <CompleteSprintDialog
        v-model:open="isCompleteOpen"
        :project-id="projectId"
        :sprint="completingSprint"
        :sprints="sprints"
        :carry-over-by-default="project.settings.carryOverIncomplete"
        @completed="load"
      />
    </template>
  </div>
</template>
