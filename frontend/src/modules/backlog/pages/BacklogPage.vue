<script setup lang="ts">
import { BarChart3, Columns3, Ellipsis, LayoutList, Plus, Rows3, Trash2, Zap } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { SortableEvent } from 'vue-draggable-plus'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileSectionSelect from '@/components/common/MobileSectionSelect.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import { formatDate } from '@/lib/format'
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
import { latestRequest } from '@/lib/latest'
import { rankBetween } from '@/lib/utils'
import { issuesApi } from '@/modules/issues/api/issues.api'
import BulkActionBar from '@/modules/issues/components/BulkActionBar.vue'
import { useIssueSelection } from '@/modules/issues/composables/useIssueSelection'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { reportsApi } from '@/modules/reports/reports.api'
import CompleteSprintDialog from '@/modules/sprints/components/CompleteSprintDialog.vue'
import SprintFormDialog from '@/modules/sprints/components/SprintFormDialog.vue'
import StartSprintDialog from '@/modules/sprints/components/StartSprintDialog.vue'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { Issue, Sprint } from '@/types/models'
import BacklogSection from '../components/BacklogSection.vue'
import PlanningBoard from '../components/PlanningBoard.vue'
import SprintCapacityStrip from '../components/SprintCapacityStrip.vue'

const BACKLOG_KEY = 'backlog'
type BacklogView = 'list' | 'planning'

const route = useRoute()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()
const openIssue = useOpenIssue()
const confirm = useConfirm()
const { isWide } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value])
const canEdit = computed(() => projects.canEdit(projectId.value))
const canManageSprints = computed(() => projects.canManageSprints(projectId.value))
const isProjectAdmin = computed(() => projects.isAdmin(projectId.value))

const issues = ref<Issue[]>([])
const epics = ref<Issue[]>([])
const sprints = ref<Sprint[]>([])
const lists = ref<Record<string, Issue[]>>({})
const isLoading = ref(true)
const isDragging = ref(false)
const showDone = ref(false)
const viewMode = ref<BacklogView>('list')
const averageVelocity = ref<number | null>(null)
const epicFilter = ref<string | null>(null)
const epicSelect = computed({
  get: () => epicFilter.value ?? '',
  set: (value: string) => {
    epicFilter.value = value || null
  },
})
const epicOptions = computed(() => [
  { value: '', label: 'All' },
  ...epics.value.map((epic) => ({ value: epic.id, label: epic.title })),
])

const isSprintFormOpen = ref(false)
const editingSprint = ref<Sprint | null>(null)
const startingSprint = ref<Sprint | null>(null)
const completingSprint = ref<Sprint | null>(null)

const openSprints = computed(() => sprints.value.filter((sprint) => sprint.state !== 'completed'))
const completedSprints = computed(() =>
  sprints.value
    .filter((sprint) => sprint.state === 'completed')
    .slice()
    .sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? '')),
)
const showCompletedSprints = ref(false)
const completedLists = ref<Record<string, Issue[]>>({})
const hasActiveSprint = computed(() => sprints.value.some((sprint) => sprint.state === 'active'))
const capacitySprint = computed(
  () => openSprints.value.find((sprint) => sprint.state === 'active') ?? openSprints.value[0] ?? null,
)
const memberCount = computed(() => Math.max(1, project.value?.members?.length ?? 1))
const minutesPerWeek = computed(() => workspace.settings.capacity?.minutesPerWeek ?? 2400)
const sprintLengthDays = computed(() => project.value?.settings.sprintLengthDays ?? 14)
const moveTargets = computed(() => [
  ...openSprints.value.map((sprint) => ({ key: sprint.id, label: sprint.name })),
  { key: BACKLOG_KEY, label: 'Backlog' },
])

const BACKLOG_LIMIT = 1000
const latest = latestRequest()
/** Why the backlog did not load (shown with a retry), or null. */
const loadError = ref<string | null>(null)
/** How many tasks exist beyond the backlog soft cap. */
const hiddenCount = ref(0)

async function load() {
  if (isDragging.value) return
  const ticket = latest.start()
  const id = projectId.value
  try {
    const detail = await projects.fetchProject(id)
    if (detail.type !== 'scrum') return
    const [sprintList, result, velocity] = await Promise.all([
      sprintsApi.list(id),
      issuesApi.list({ projectId: id, sort: 'position', order: 'asc', limit: BACKLOG_LIMIT }),
      reportsApi.velocity(id).catch(() => null),
    ])
    if (!latest.isCurrent(ticket)) return
    sprints.value = sprintList
    epics.value = result.issues.filter((issue) => issue.type === 'epic')
    issues.value = result.issues.filter((issue) => issue.type !== 'epic' && issue.type !== 'subtask')
    averageVelocity.value = velocity?.averageVelocity ?? null
    hiddenCount.value = Math.max(0, result.total - result.issues.length)
    loadError.value = null
  } catch (error) {
    if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
  } finally {
    if (latest.isCurrent(ticket)) isLoading.value = false
  }
}

const selection = useIssueSelection(load)

function rebuildLists() {
  const visible = issues.value.filter((issue) => !epicFilter.value || issue.parentId === epicFilter.value)
  const next: Record<string, Issue[]> = {}
  for (const sprint of openSprints.value) next[sprint.id] = visible.filter((issue) => issue.sprintId === sprint.id)
  next[BACKLOG_KEY] = visible.filter((issue) => !issue.sprintId && (showDone.value || issue.status.category !== 'done'))
  lists.value = next

  const completed: Record<string, Issue[]> = {}
  for (const sprint of completedSprints.value) completed[sprint.id] = visible.filter((issue) => issue.sprintId === sprint.id)
  completedLists.value = completed
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
    description:
      sprint.state === 'completed'
        ? 'Tasks still on this sprint move to the backlog. Its reports will no longer be available.'
        : 'Its tasks will move back to the backlog.',
    confirmLabel: 'Delete sprint',
    destructive: true,
  })
  if (!confirmed) return
  try {
    await sprintsApi.remove(projectId.value, sprint.id)
    toast.success(`${sprint.name} deleted`)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const isStartOpen = computed({ get: () => Boolean(startingSprint.value), set: (open) => !open && (startingSprint.value = null) })
const isCompleteOpen = computed({ get: () => Boolean(completingSprint.value), set: (open) => !open && (completingSprint.value = null) })
</script>

<template>
  <PageFrame mode="scroll" class="space-y-4 sm:space-y-5">
    <div v-if="isLoading" class="space-y-3" aria-busy="true" aria-label="Loading backlog">
      <Skeleton v-for="index in 3" :key="index" class="h-40 w-full rounded-xl" />
    </div>

    <EmptyState v-else-if="loadError && !project" title="The backlog did not load" :description="loadError">
      <Button variant="outline" @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="project?.type !== 'scrum'"
      title="Backlog is for scrum projects"
      description="Kanban projects plan work directly on the board."
    />

    <template v-else>
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div v-if="epics.length" class="min-w-0 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
          <MobileSectionSelect v-if="!isWide" v-model="epicSelect" :options="epicOptions" aria-label="Filter by epic" />
          <template v-else>
            <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"><Zap class="size-3.5" /> Epics</span>
            <Button size="xs" class="shrink-0" :variant="epicFilter === null ? 'secondary' : 'ghost'" @click="epicFilter = null">All</Button>
            <Button
              v-for="epic in epics"
              :key="epic.id"
              size="xs"
              :variant="epicFilter === epic.id ? 'secondary' : 'ghost'"
              class="max-w-48 shrink-0 truncate"
              @click="epicFilter = epicFilter === epic.id ? null : epic.id"
            >
              {{ epic.title }}
            </Button>
          </template>
        </div>
        <div class="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <div class="inline-flex rounded-lg border p-0.5" role="group" aria-label="Backlog view">
            <Button
              size="xs"
              class="gap-1.5"
              :variant="viewMode === 'list' ? 'secondary' : 'ghost'"
              @click="viewMode = 'list'"
            >
              <LayoutList class="size-3.5" /> List
            </Button>
            <Button
              size="xs"
              class="gap-1.5"
              :variant="viewMode === 'planning' ? 'secondary' : 'ghost'"
              @click="viewMode = 'planning'"
            >
              <Rows3 class="size-3.5" /> Planning
            </Button>
          </div>
          <label class="flex items-center gap-2 text-sm text-muted-foreground"><Switch v-model="showDone" /> Show done</label>
          <Button v-if="canManageSprints" size="sm" variant="outline" class="max-sm:w-full" @click="openSprintForm()"><Plus /> Create sprint</Button>
        </div>
      </div>

      <p
        v-if="hiddenCount"
        class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning"
        role="status"
      >
        The backlog shows the first {{ BACKLOG_LIMIT }} of {{ BACKLOG_LIMIT + hiddenCount }} tasks for speed; {{ hiddenCount }} more are in
        <RouterLink :to="{ name: 'project-issues', params: { projectId } }" class="font-medium underline">the task list</RouterLink>.
      </p>

      <SprintCapacityStrip
        v-if="viewMode === 'planning' && capacitySprint"
        :sprint="capacitySprint"
        :issues="lists[capacitySprint.id] ?? []"
        :member-count="memberCount"
        :sprint-length-days="sprintLengthDays"
        :minutes-per-week="minutesPerWeek"
        :average-velocity="averageVelocity"
      />

      <PlanningBoard
        v-if="viewMode === 'planning'"
        :project-id="projectId"
        :open-sprints="openSprints"
        v-model:lists="lists"
        :move-targets="moveTargets"
        :editable="canEdit"
        :can-manage-sprints="canManageSprints"
        :has-active-sprint="hasActiveSprint"
        :is-project-admin="isProjectAdmin"
        :is-selected="selection.isSelected"
        @open="openIssue"
        @toggle-select="(issue) => selection.toggle(issue.id)"
        @drag-start="isDragging = true"
        @drag-end="onDragEnd"
        @move-to="moveTo"
        @start-sprint="startingSprint = $event"
        @complete-sprint="completingSprint = $event"
        @edit-sprint="openSprintForm"
        @delete-sprint="deleteSprint"
      />

      <template v-else>
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
          <template v-if="canManageSprints" #actions>
            <Button v-if="sprint.state === 'planned' && !hasActiveSprint" size="xs" @click="startingSprint = sprint">Start sprint</Button>
            <Button v-if="sprint.state === 'active'" size="xs" variant="outline" @click="completingSprint = sprint">Complete sprint</Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-sm" :aria-label="`${sprint.name} actions`"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openSprintForm(sprint)">Edit sprint</DropdownMenuItem>
                <DropdownMenuItem v-if="sprint.state !== 'active' && isProjectAdmin" variant="destructive" @select="deleteSprint(sprint)">Delete sprint</DropdownMenuItem>
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
      </template>

      <section v-if="completedSprints.length" class="space-y-3">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-card/60 px-3 py-3 text-left text-sm font-medium sm:px-4"
          :aria-expanded="showCompletedSprints"
          @click="showCompletedSprints = !showCompletedSprints"
        >
          <span>
            Completed sprints
            <span class="font-normal text-muted-foreground tabular-nums">({{ completedSprints.length }})</span>
          </span>
          <span class="text-xs text-muted-foreground">{{ showCompletedSprints ? 'Hide' : 'Show & revisit' }}</span>
        </button>

        <div v-if="showCompletedSprints" class="space-y-3">
          <BacklogSection
            v-for="sprint in completedSprints"
            :key="sprint.id"
            v-model="completedLists[sprint.id]"
            :section-key="sprint.id"
            :title="sprint.name"
            :sprint="sprint"
            :project-id="projectId"
            :move-targets="[]"
            :editable="false"
            start-collapsed
            :is-selected="() => false"
            @open="openIssue"
          >
            <template #actions>
              <span class="mr-1 hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
                {{ (sprint.stats ?? sprint.summary)?.doneCount ?? 0 }}/{{ (sprint.stats ?? sprint.summary)?.issueCount ?? 0 }} done
                <template v-if="sprint.endDate"> · ended {{ formatDate(sprint.endDate, 'd MMM yyyy') }}</template>
              </span>
              <Button size="xs" variant="outline" as-child>
                <RouterLink :to="{ name: 'project-board', params: { projectId }, query: { sprintId: sprint.id } }">
                  <Columns3 /> Board
                </RouterLink>
              </Button>
              <Button size="xs" variant="outline" as-child>
                <RouterLink :to="{ name: 'project-reports', params: { projectId }, query: { sprintId: sprint.id } }">
                  <BarChart3 /> Reports
                </RouterLink>
              </Button>
              <Button
                v-if="isProjectAdmin"
                size="xs"
                variant="ghost"
                class="text-destructive hover:text-destructive"
                @click="deleteSprint(sprint)"
              >
                <Trash2 /> Delete
              </Button>
            </template>
          </BacklogSection>
        </div>
      </section>

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
  </PageFrame>
</template>
