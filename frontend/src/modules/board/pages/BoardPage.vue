<script setup lang="ts">
import { addDays, endOfDay, isBefore, parseISO, startOfDay, subDays } from 'date-fns'
import { CalendarCheck, ChevronDown, Columns3, ListFilter, Search, SearchX } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { SortableEvent } from 'vue-draggable-plus'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { SelectField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { ISSUE_TYPE_META, ISSUE_TYPES, PRIORITIES, PRIORITY_META } from '@/constants/issue'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { allowedStatusesFor, transitionRuleFor } from '@/lib/workflow-transitions'
import { rankBetween } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type CreateIssueInput, issuesApi } from '@/modules/issues/api/issues.api'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import CompleteSprintDialog from '@/modules/sprints/components/CompleteSprintDialog.vue'
import SprintProgress from '@/modules/sprints/components/SprintProgress.vue'
import type { Issue, IssuePriority, IssueReference, IssueType, Status, UserSummary } from '@/types/models'
import BoardCell from '../components/BoardCell.vue'
import BoardColumnHeader from '../components/BoardColumnHeader.vue'
import BoardDisplayMenu from '../components/BoardDisplayMenu.vue'
import BoardFilters, { type BoardFilterState } from '../components/BoardFilters.vue'
import MobileBoard from '../components/MobileBoard.vue'
import { useBoardData } from '../composables/useBoardData'
import { useBoardView } from '../composables/useBoardView'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const openIssue = useOpenIssue()
const confirm = useConfirm()
const { isPhone, isWide } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const preferredSprintId = computed(() => (typeof route.query.sprintId === 'string' ? route.query.sprintId : null))
const {
  project,
  issues,
  sprints,
  boardSprints,
  activeSprint,
  viewedSprint,
  selectedSprintId,
  isHistorical,
  isScrum,
  isLoading,
  isDragging,
  loadError,
  hiddenCount,
  selectSprint,
  reload,
} = useBoardData(projectId, preferredSprintId)
const { view, update: updateView, setField, toggleColumn, toggleLane, reset: resetView, isCustomized } = useBoardView(projectId)

const canEdit = computed(() => projects.canEdit(projectId.value) && !isHistorical.value)
const canManageSprints = computed(() => projects.canManageSprints(projectId.value))
const canConfigure = computed(() => projects.isAdmin(projectId.value))
const sprintOptions = computed(() =>
  boardSprints.value.map((sprint) => ({
    value: sprint.id,
    label: sprint.name,
    description:
      sprint.state === 'active'
        ? 'Active'
        : sprint.state === 'planned'
          ? 'Planned'
          : `Completed${sprint.endDate ? ` · ${formatDate(sprint.endDate, 'd MMM yyyy')}` : ''}`,
  })),
)

function onSelectSprint(value: string | null | undefined) {
  const sprintId = typeof value === 'string' ? value : null
  if (!sprintId) return
  void selectSprint(sprintId)
  const query = { ...route.query, sprintId }
  void router.replace({ query })
}

watch(selectedSprintId, (sprintId) => {
  if (!isScrum.value) return
  const current = typeof route.query.sprintId === 'string' ? route.query.sprintId : null
  if (sprintId === current) return
  const query = { ...route.query }
  if (sprintId) query.sprintId = sprintId
  else delete query.sprintId
  void router.replace({ query })
})
const filters = ref<BoardFilterState>({ search: '', assigneeIds: [] })
const isCompleteOpen = ref(false)
const isFilterSheetOpen = ref(false)
const statuses = computed(() => project.value?.statuses ?? [])
const mobileFilterCount = computed(() => {
  const value = filters.value
  return (
    value.assigneeIds.length +
    (value.types ? 1 : 0) +
    (value.priorities ? 1 : 0) +
    (value.labelIds ? 1 : 0) +
    (value.quick?.length ?? 0)
  )
})

// --- Filtering ---------------------------------------------------------------
const filteredIssues = computed(() => {
  const term = filters.value.search.trim().toLowerCase()
  const types = filters.value.types?.split(',')
  const priorities = filters.value.priorities?.split(',')
  const labelIds = filters.value.labelIds?.split(',')
  const assignees = filters.value.assigneeIds
  const quick = new Set(filters.value.quick ?? [])
  const today = startOfDay(new Date())
  const weekEnd = endOfDay(addDays(today, 7))
  const dayAgo = subDays(new Date(), 1)
  return issues.value.filter((issue) => {
    const due = issue.dueDate ? parseISO(issue.dueDate) : null
    const open = issue.status.category !== 'done'
    return (
      (!term || issue.title.toLowerCase().includes(term) || issue.key.toLowerCase().includes(term)) &&
      (!assignees.length || assignees.includes(issue.assigneeId ?? 'unassigned')) &&
      (!types || types.includes(issue.type)) &&
      (!priorities || priorities.includes(issue.priority)) &&
      (!labelIds || issue.labels.some((label) => labelIds.includes(label.id))) &&
      (!quick.has('mine') || issue.assigneeId === auth.user?.id) &&
      (!quick.has('dueSoon') || Boolean(due && open && !isBefore(due, today) && isBefore(due, weekEnd))) &&
      (!quick.has('overdue') || Boolean(due && open && isBefore(due, today))) &&
      (!quick.has('recent') || !isBefore(parseISO(issue.updatedAt), dayAgo))
    )
  })
})
const isFiltered = computed(() => filteredIssues.value.length !== issues.value.length)

// --- Swimlanes ---------------------------------------------------------------
interface Lane {
  key: string
  label: string
  user?: UserSummary | null
  priority?: IssuePriority
  type?: IssueType
  epic?: IssueReference | null
}
const NONE_LANE = 'all'
/** Swimlanes where dropping a card into another lane changes that field (like Jira). */
const crossLane = computed(() => ['none', 'assignee', 'priority'].includes(view.value.groupBy))

function laneKeyOf(issue: Issue) {
  switch (view.value.groupBy) {
    case 'assignee':
      return issue.assigneeId ?? 'unassigned'
    case 'priority':
      return issue.priority
    case 'type':
      return issue.type
    case 'epic':
      return issue.parent?.id ?? 'none'
    default:
      return NONE_LANE
  }
}

const lanes = computed<Lane[]>(() => {
  const present = new Set(filteredIssues.value.map(laneKeyOf))
  switch (view.value.groupBy) {
    case 'assignee': {
      const members = (project.value?.members ?? []).filter((member) => present.has(member.id))
      members.sort((a, b) => (a.id === auth.user?.id ? -1 : b.id === auth.user?.id ? 1 : a.name.localeCompare(b.name)))
      return [...members.map((user) => ({ key: user.id, label: user.id === auth.user?.id ? `${user.name} (you)` : user.name, user })), { key: 'unassigned', label: 'Unassigned', user: null }]
    }
    case 'priority':
      return PRIORITIES.map((priority) => ({ key: priority, label: PRIORITY_META[priority].label, priority }))
    case 'type':
      return ISSUE_TYPES.filter((type) => present.has(type)).map((type) => ({ key: type, label: ISSUE_TYPE_META[type].label, type }))
    case 'epic': {
      const parents = new Map<string, IssueReference>()
      for (const issue of filteredIssues.value) if (issue.parent) parents.set(issue.parent.id, issue.parent)
      return [
        ...[...parents.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })).map((epic) => ({ key: epic.id, label: epic.title, epic })),
        { key: 'none', label: 'No epic', epic: null },
      ]
    }
    default:
      return [{ key: NONE_LANE, label: '' }]
  }
})

/** cells[laneKey][statusId]: the cards of one status in one swimlane, in board order. */
const cells = ref<Record<string, Record<string, Issue[]>>>({})
function rebuildCells() {
  const next: Record<string, Record<string, Issue[]>> = {}
  for (const lane of lanes.value) next[lane.key] = Object.fromEntries(statuses.value.map((status) => [status.id, [] as Issue[]]))
  for (const issue of [...filteredIssues.value].sort((a, b) => a.position - b.position)) next[laneKeyOf(issue)]?.[issue.statusId]?.push(issue)
  cells.value = next
}
watch([filteredIssues, statuses, lanes], rebuildCells, { immediate: true })

const laneCount = (laneKey: string) => Object.values(cells.value[laneKey] ?? {}).reduce((total, list) => total + list.length, 0)
const laneDone = (laneKey: string) =>
  statuses.value.filter((status) => status.category === 'done').reduce((total, status) => total + (cells.value[laneKey]?.[status.id]?.length ?? 0), 0)
/** Empty assignee and type lanes are hidden; priority lanes stay as drop targets. */
const shownLanes = computed(() => lanes.value.filter((lane) => view.value.groupBy === 'none' || view.value.groupBy === 'priority' || laneCount(lane.key) > 0))

const columnIssues = (statusId: string) => filteredIssues.value.filter((issue) => issue.statusId === statusId)
const columnPoints = (statusId: string) => columnIssues(statusId).reduce((total, issue) => total + (issue.storyPoints ?? 0), 0)
const isCollapsed = (statusId: string) => view.value.collapsedColumns.includes(statusId)
const gridTemplate = computed(() => statuses.value.map((status) => (isCollapsed(status.id) ? '2.75rem' : 'minmax(16rem, 1fr)')).join(' '))

/** A task added in a cell gets its status and its swimlane's assignee, priority, type or epic. */
function cellDefaults(lane: Lane, status: Status): Partial<CreateIssueInput> {
  const defaults: Partial<CreateIssueInput> = { statusId: status.id, sprintId: viewedSprint.value?.id ?? null }
  if (view.value.groupBy === 'assignee') defaults.assigneeId = lane.user?.id ?? null
  if (view.value.groupBy === 'priority' && lane.priority) defaults.priority = lane.priority
  if (view.value.groupBy === 'type' && lane.type) defaults.type = lane.type
  if (view.value.groupBy === 'epic' && lane.epic) defaults.parentId = lane.epic.id
  return defaults
}
const adding = ref<string | null>(null)
const cellId = (laneKey: string, statusId: string) => `${laneKey}:${statusId}`
function addInColumn(status: Status) {
  if (isCollapsed(status.id)) toggleColumn(status.id)
  const lane = shownLanes.value[0]
  if (lane) adding.value = cellId(lane.key, status.id)
}

// --- Progress ----------------------------------------------------------------
const sprintStats = computed(() => {
  const done = issues.value.filter((issue) => issue.status.category === 'done')
  return {
    issueCount: issues.value.length,
    doneCount: done.length,
    totalPoints: issues.value.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
    donePoints: done.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
  }
})
const donePercent = computed(() => (sprintStats.value.issueCount ? Math.round((sprintStats.value.doneCount / sprintStats.value.issueCount) * 100) : 0))

// --- Moving cards ------------------------------------------------------------
/** Column card count excluding the card being moved (so WIP checks the destination after the drop). */
function columnCount(statusId: string, excludingId?: string) {
  let total = 0
  for (const laneCells of Object.values(cells.value)) {
    for (const card of laneCells[statusId] ?? []) if (card.id !== excludingId) total += 1
  }
  return total
}

async function persistMove(issue: Issue, status: Status, position: number, lane: Lane | null = null) {
  if (issue.statusId !== status.id) {
    const allowed = allowedStatusesFor(statuses.value, project.value?.workflowTransitions, issue.statusId)
    if (!allowed.some((item) => item.id === status.id)) {
      toast.error(`“${issue.status.name}” cannot move to “${status.name}”`)
      rebuildCells()
      return
    }
    const rule = transitionRuleFor(project.value?.workflowTransitions, issue.statusId)
    if (rule?.requireAssignee && !issue.assigneeId) {
      toast.error('Assign someone before moving to this status')
      rebuildCells()
      return
    }
  }
  let transitionComment: string | undefined
  if (issue.statusId !== status.id) {
    const rule = transitionRuleFor(project.value?.workflowTransitions, issue.statusId)
    if (rule?.requireComment) {
      const comment = window.prompt('Add a comment for this status change')
      if (comment === null) {
        rebuildCells()
        return
      }
      transitionComment = comment.trim()
      if (!transitionComment) {
        toast.error('A comment is required for this transition')
        rebuildCells()
        return
      }
    }
  }
  if (status.wipLimit && issue.statusId !== status.id) {
    const nextCount = columnCount(status.id, issue.id) + 1
    if (nextCount > status.wipLimit) {
      const ok = await confirm({
        title: `${status.name} is over its WIP limit`,
        description: `This column is limited to ${status.wipLimit} cards and would have ${nextCount}. Move anyway?`,
        confirmLabel: 'Move anyway',
      })
      if (!ok) {
        rebuildCells()
        return
      }
    }
  }
  const previous = { statusId: issue.statusId, status: issue.status, position: issue.position, assigneeId: issue.assigneeId, assignee: issue.assignee, priority: issue.priority }
  const changes: { assigneeId?: string | null; priority?: IssuePriority } = {}
  if (lane && view.value.groupBy === 'assignee' && (lane.user?.id ?? null) !== issue.assigneeId) changes.assigneeId = lane.user?.id ?? null
  if (lane && view.value.groupBy === 'priority' && lane.priority && lane.priority !== issue.priority) changes.priority = lane.priority
  Object.assign(issue, { statusId: status.id, status, position })
  if ('assigneeId' in changes) Object.assign(issue, { assigneeId: changes.assigneeId, assignee: lane?.user ?? null })
  if (changes.priority) issue.priority = changes.priority
  rebuildCells()
  try {
    if (Object.keys(changes).length) await issuesApi.update(issue.id, changes)
    if (previous.statusId !== status.id || previous.position !== position) {
      await issuesApi.move(issue.id, { statusId: status.id, position, ...(transitionComment ? { transitionComment } : {}) })
    }
    if ('assigneeId' in changes) toast.success(`${issue.key} assigned to ${lane?.user?.name ?? 'nobody'}`)
    if (changes.priority) toast.success(`${issue.key} is now ${PRIORITY_META[changes.priority].label.toLowerCase()} priority`)
  } catch (error) {
    Object.assign(issue, previous)
    rebuildCells()
    toast.error(getErrorMessage(error))
  }
}

async function onDragEnd(event: SortableEvent) {
  isDragging.value = false
  const issueId = (event.item as HTMLElement).dataset.issueId
  const target = event.to as HTMLElement
  const statusId = target.dataset.statusId
  const laneKey = target.dataset.lane ?? NONE_LANE
  const status = statuses.value.find((item) => item.id === statusId)
  const issue = issues.value.find((item) => item.id === issueId)
  const lane = lanes.value.find((item) => item.key === laneKey) ?? null
  if (!issue || !status || !statusId) return
  const list = cells.value[laneKey]?.[statusId] ?? []
  const index = list.findIndex((item) => item.id === issueId)
  const position = rankBetween(list[index - 1]?.position, list[index + 1]?.position)
  const sameLane = laneKeyOf(issue) === laneKey
  if (issue.statusId === statusId && issue.position === position && sameLane) return
  await persistMove(issue, status, position, sameLane ? null : lane)
}

/** Moves a card with the keyboard (see BoardCell), then keeps focus on it so it can be moved again. */
async function moveWithKeyboard(issue: Issue, move: { column?: -1 | 1; within?: -1 | 1 }) {
  const laneKey = laneKeyOf(issue)
  const current = statuses.value.findIndex((status) => status.id === issue.statusId)
  if (move.column) {
    const target = statuses.value[current + move.column]
    if (!target) return
    const lastInCell = (cells.value[laneKey]?.[target.id] ?? []).at(-1)
    await persistMove(issue, target, rankBetween(lastInCell?.position, null))
    announce(`${issue.key} moved to ${target.name}`)
  } else if (move.within) {
    const list = cells.value[laneKey]?.[issue.statusId] ?? []
    const index = list.findIndex((item) => item.id === issue.id)
    const swapWith = index + move.within
    if (index < 0 || swapWith < 0 || swapWith >= list.length) return
    const status = statuses.value[current]
    if (!status) return
    // The new spot lies between the neighbour it passes and the one beyond it.
    const [before, after] = move.within < 0 ? [list[swapWith - 1], list[swapWith]] : [list[swapWith], list[swapWith + 1]]
    await persistMove(issue, status, rankBetween(before?.position, after?.position))
    announce(`${issue.key} moved ${move.within < 0 ? 'up' : 'down'}`)
  }
  await nextTick()
  document.querySelector<HTMLElement>(`[data-issue-id="${issue.id}"]`)?.focus()
}

/** Read out by screen readers after a keyboard move. */
const liveMessage = ref('')
const announce = (message: string) => (liveMessage.value = message)

function moveOnMobile(issue: Issue, status: Status) {
  const lastInColumn = issues.value.filter((item) => item.statusId === status.id).at(-1)
  void persistMove(issue, status, rankBetween(lastInColumn?.position, null))
  toast.success(`${issue.key} moved to ${status.name}`)
}
</script>

<template>
  <div
    class="flex w-full flex-col"
    :class="isPhone ? 'w-full overflow-visible' : 'h-full min-h-0 overflow-x-clip'"
  >
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    <div v-if="isLoading" class="flex gap-3 overflow-x-auto p-3 sm:p-4" aria-busy="true" aria-label="Loading board">
      <Skeleton v-for="index in 4" :key="index" class="h-96 w-64 shrink-0 rounded-xl sm:min-w-64 sm:flex-1" />
    </div>

    <EmptyState v-else-if="loadError" :icon="Columns3" title="The board did not load" :description="loadError" class="px-3 py-20">
      <Button variant="outline" @click="reload">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="isScrum && !viewedSprint"
      :icon="CalendarCheck"
      title="No sprint to show"
      description="Start a sprint in the backlog, or complete one first so you can revisit it here."
      class="px-3 py-20"
    >
      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button as-child>
          <RouterLink :to="{ name: 'project-backlog', params: { projectId } }">Go to backlog</RouterLink>
        </Button>
        <Button variant="outline" @click="reload">Refresh</Button>
      </div>
    </EmptyState>

    <template v-else-if="project">
      <p v-if="hiddenCount" class="mx-3 mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 sm:mx-4 dark:text-warning" role="status">
        The board shows the first {{ issues.length }} of {{ issues.length + hiddenCount }} tasks for speed; {{ hiddenCount }} more are in
        <RouterLink :to="{ name: 'project-issues', params: { projectId } }" class="font-medium underline">the task list</RouterLink>.
      </p>

      <!-- Desktop: the whole workflow at a glance -->
      <template v-if="isWide">
        <div class="flex flex-col gap-2 border-b border-border px-3 py-2.5 lg:flex-row lg:items-start lg:gap-3 lg:px-4">
          <div class="min-w-0 flex-1">
            <BoardFilters v-model="filters" :members="project.members" :labels="project.labels" />
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 lg:gap-3">
            <template v-if="isScrum && boardSprints.length">
              <SelectField
                class="w-48 sm:w-56"
                size="sm"
                :model-value="selectedSprintId"
                :options="sprintOptions"
                aria-label="Sprint on this board"
                placeholder="Choose sprint"
                @update:model-value="onSelectSprint"
              />
              <span
                v-if="viewedSprint"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="
                  isHistorical
                    ? 'bg-muted text-muted-foreground'
                    : viewedSprint.state === 'planned'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-success/15 text-success'
                "
              >
                {{ isHistorical ? 'Completed' : viewedSprint.state === 'planned' ? 'Planned' : 'Active' }}
              </span>
              <div v-if="viewedSprint" class="hidden xl:block"><SprintProgress :sprint="viewedSprint" :stats="sprintStats" inline /></div>
              <Button
                v-if="canManageSprints && viewedSprint?.state === 'active'"
                variant="outline"
                size="sm"
                @click="isCompleteOpen = true"
              >
                Complete sprint
              </Button>
            </template>
            <div v-else-if="sprintStats.issueCount" class="hidden items-center gap-2 text-xs text-muted-foreground lg:flex" :title="`${sprintStats.doneCount} of ${sprintStats.issueCount} tasks done`">
              <span class="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span class="block h-full rounded-full bg-success transition-[width]" :style="{ width: `${donePercent}%` }" />
              </span>
              <span class="tabular-nums"><strong class="font-semibold text-foreground">{{ donePercent }}%</strong> done · {{ sprintStats.issueCount }} tasks</span>
            </div>
            <BoardDisplayMenu
              class="ml-auto"
              :view="view"
              :customized="isCustomized"
              @group-by="(groupBy) => updateView({ groupBy })"
              @density="(density) => updateView({ density })"
              @field="setField"
              @reset="resetView"
            />
          </div>
        </div>

        <p v-if="isFiltered" class="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.03] px-3 py-1.5 text-xs text-muted-foreground lg:px-4">
          Showing <strong class="font-semibold text-foreground tabular-nums">{{ filteredIssues.length }}</strong> of {{ issues.length }} tasks
          <button type="button" class="font-medium text-primary hover:underline" @click="filters = { search: '', assigneeIds: [] }">Clear filters</button>
        </p>

        <div class="min-h-0 flex-1 overflow-auto scrollbar-thin" :class="isDragging && 'select-none'">
          <!-- Without swimlanes the columns run down to the bottom of the board -->
          <div
            class="inline-grid min-w-full gap-x-2 px-3 pb-4 sm:gap-x-3 sm:px-4"
            :class="view.groupBy === 'none' && 'min-h-full'"
            :style="{ gridTemplateColumns: gridTemplate, gridTemplateRows: view.groupBy === 'none' ? 'auto 1fr' : undefined }"
          >
            <!-- Column headers stay pinned while the board scrolls -->
            <div class="sticky top-0 z-20 col-span-full grid gap-x-2 bg-background pt-3 pb-2 sm:gap-x-3" :style="{ gridTemplateColumns: gridTemplate }">
              <BoardColumnHeader
                v-for="status in statuses"
                :key="status.id"
                :status="status"
                :count="columnIssues(status.id).length"
                :points="columnPoints(status.id)"
                :collapsed="isCollapsed(status.id)"
                :editable="canEdit"
                :can-configure="canConfigure"
                :project-id="projectId"
                @toggle="toggleColumn(status.id)"
                @add="addInColumn(status)"
              />
            </div>

            <template v-for="lane in shownLanes" :key="lane.key">
              <!-- Swimlane header -->
              <button
                v-if="view.groupBy !== 'none'"
                type="button"
                class="sticky left-4 z-10 col-span-full mt-3 mb-2 flex w-max items-center gap-2 rounded-md py-1 pr-2 text-left text-[13px] hover:bg-accent/50"
                :aria-expanded="!view.collapsedLanes.includes(lane.key)"
                @click="toggleLane(lane.key)"
              >
                <ChevronDown class="size-4 text-muted-foreground transition-transform" :class="view.collapsedLanes.includes(lane.key) && '-rotate-90'" />
                <UserAvatar v-if="view.groupBy === 'assignee'" :user="lane.user ?? null" size="sm" presence />
                <PriorityIcon v-else-if="lane.priority" :priority="lane.priority" />
                <IssueTypeIcon v-else-if="lane.type" :type="lane.type" />
                <span v-else-if="view.groupBy === 'epic'" class="size-2.5 rounded-sm" :class="lane.epic ? 'bg-violet-500' : 'bg-muted-foreground/40'" />
                <span class="font-semibold">{{ lane.label }}</span>
                <span v-if="lane.epic" class="text-xs text-muted-foreground">{{ lane.epic.key }}</span>
                <span class="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">{{ laneCount(lane.key) }}</span>
                <span v-if="laneCount(lane.key)" class="text-[11px] text-muted-foreground tabular-nums">· {{ laneDone(lane.key) }} done</span>
              </button>

              <template v-if="!view.collapsedLanes.includes(lane.key) || view.groupBy === 'none'">
                <template v-for="status in statuses" :key="`${lane.key}-${status.id}`">
                  <button
                    v-if="isCollapsed(status.id)"
                    type="button"
                    class="flex min-h-20 items-start justify-center rounded-xl bg-muted/50 pt-3 text-[11px] font-semibold text-muted-foreground tabular-nums hover:bg-muted dark:bg-muted/35"
                    :class="view.groupBy === 'none' ? 'self-stretch' : 'mb-1 self-start'"
                    :aria-label="`Expand ${status.name}`"
                    @click="toggleColumn(status.id)"
                  >
                    {{ cells[lane.key]?.[status.id]?.length ?? 0 }}
                  </button>
                  <BoardCell
                    v-else-if="cells[lane.key]?.[status.id]"
                    v-model="cells[lane.key]![status.id]!"
                    :class="view.groupBy !== 'none' && 'mb-1'"
                    :status="status"
                    :lane-key="lane.key"
                    :group="crossLane ? 'board' : `board-${lane.key}`"
                    :project-id="projectId"
                    :defaults="cellDefaults(lane, status)"
                    :view="view"
                    :editable="canEdit"
                    :dragging="isDragging"
                    :adding="adding === cellId(lane.key, status.id)"
                    :fill="view.groupBy === 'none'"
                    @open="openIssue"
                    @drag-start="isDragging = true"
                    @drag-end="onDragEnd"
                    @key-move="moveWithKeyboard"
                    @add="adding = cellId(lane.key, status.id)"
                    @close-add="adding = null"
                  />
                </template>
              </template>
            </template>

            <div v-if="isFiltered && !filteredIssues.length" class="col-span-full flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <SearchX class="size-6" /> No tasks match these filters.
              <Button variant="outline" size="sm" @click="filters = { search: '', assigneeIds: [] }">Clear filters</Button>
            </div>
            <EmptyState v-if="!statuses.length" :icon="Columns3" title="No workflow statuses" class="col-span-full" />
          </div>
        </div>
      </template>

      <!-- Phone and tablet: one status at a time. Phone scrolls the page; tablet scrolls inside the shell. -->
      <template v-else>
        <div class="flex w-full min-w-0 flex-col" :class="isPhone ? '' : 'h-full min-h-0 overflow-y-auto'">
          <div class="flex items-center gap-2 border-b border-border px-3 py-2">
            <div class="relative min-w-0 flex-1">
              <Search class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="filters.search" placeholder="Search board" class="h-9 pl-8" aria-label="Search this board" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="relative shrink-0"
              :aria-pressed="isFilterSheetOpen"
              @click="isFilterSheetOpen = true"
            >
              <ListFilter class="size-4" />
              Filters
              <span
                v-if="mobileFilterCount"
                class="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
              >
                {{ mobileFilterCount }}
              </span>
            </Button>
            <BoardDisplayMenu
              :view="view"
              :customized="isCustomized"
              @group-by="(groupBy) => updateView({ groupBy })"
              @density="(density) => updateView({ density })"
              @field="setField"
              @reset="resetView"
            />
          </div>

          <p v-if="isFiltered" class="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.03] px-3 py-1.5 text-xs text-muted-foreground">
            Showing <strong class="font-semibold text-foreground tabular-nums">{{ filteredIssues.length }}</strong> of {{ issues.length }}
            <button type="button" class="font-medium text-primary hover:underline" @click="filters = { search: '', assigneeIds: [] }">Clear</button>
          </p>

          <div v-if="isScrum && boardSprints.length" class="space-y-2 border-b border-border px-3 py-2">
            <SelectField
              size="sm"
              :model-value="selectedSprintId"
              :options="sprintOptions"
              aria-label="Sprint on this board"
              placeholder="Choose sprint"
              @update:model-value="onSelectSprint"
            />
            <div v-if="viewedSprint" class="flex items-center justify-between gap-2">
              <p class="min-w-0 truncate text-sm font-semibold">
                {{ viewedSprint.name }}
                <span class="ml-1 text-[11px] font-medium text-muted-foreground">
                  · {{ isHistorical ? 'completed' : viewedSprint.state === 'planned' ? 'planned' : 'active' }}
                </span>
              </p>
              <Button
                v-if="canManageSprints && viewedSprint.state === 'active'"
                variant="outline"
                size="xs"
                class="shrink-0"
                @click="isCompleteOpen = true"
              >
                Complete
              </Button>
            </div>
            <SprintProgress v-if="viewedSprint" :sprint="viewedSprint" :stats="sprintStats" />
          </div>

          <MobileBoard
            :statuses="statuses"
            :issues="filteredIssues"
            :project-id="projectId"
            :sprint-id="viewedSprint?.id ?? null"
            :editable="canEdit"
            :group-by="view.groupBy"
            :lanes="shownLanes"
            :lane-of="laneKeyOf"
            :transitions="project?.workflowTransitions ?? []"
            @open="openIssue"
            @move="moveOnMobile"
          />

          <Sheet v-model:open="isFilterSheetOpen">
            <SheetContent side="bottom" class="gap-0">
              <SheetHeader><SheetTitle>Board filters</SheetTitle></SheetHeader>
              <div class="space-y-4 overflow-y-auto px-4 pb-4">
                <BoardFilters v-model="filters" :members="project.members" :labels="project.labels" stacked hide-search />
                <Button class="w-full" @click="isFilterSheetOpen = false">
                  Show {{ filteredIssues.length }} tasks
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </template>

      <CompleteSprintDialog
        v-model:open="isCompleteOpen"
        :project-id="projectId"
        :sprint="activeSprint && viewedSprint?.state === 'active' ? { ...activeSprint, stats: sprintStats } : null"
        :sprints="sprints"
        :carry-over-by-default="project.settings.carryOverIncomplete"
        @completed="reload"
      />
    </template>
  </div>
</template>
