import { computed, type Ref, ref, watch } from 'vue'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import { issuesApi } from '@/modules/issues/api/issues.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Issue, Sprint } from '@/types/models'

/** Soft cap so the board stays responsive; banner links to the full task list when exceeded. */
export const BOARD_LIMIT = 1000

/** Loads project workflow and the selected sprint’s issues (active by default; planned/completed can be opened). */
export function useBoardData(projectId: Ref<string>, preferredSprintId?: Ref<string | null | undefined>) {
  const projects = useProjectsStore()
  const issues = ref<Issue[]>([])
  const sprints = ref<Sprint[]>([])
  const selectedSprintId = ref<string | null>(null)
  const isLoading = ref(true)
  const isDragging = ref(false)
  /** Why the board did not load (shown with a retry), or null. */
  const loadError = ref<string | null>(null)
  /** How many tasks exist in total, when more than the board shows. */
  const hiddenCount = ref(0)
  const latest = latestRequest()

  const project = computed(() => projects.details[projectId.value] ?? null)
  const isScrum = computed(() => project.value?.type === 'scrum')
  const activeSprint = computed(() => sprints.value.find((sprint) => sprint.state === 'active') ?? null)
  const viewedSprint = computed(() => sprints.value.find((sprint) => sprint.id === selectedSprintId.value) ?? null)
  const isHistorical = computed(() => viewedSprint.value?.state === 'completed')
  /** Sprints you can open on the board: active, then planned, then completed (newest end date first). */
  const boardSprints = computed(() => {
    const active = sprints.value.filter((sprint) => sprint.state === 'active')
    const planned = sprints.value.filter((sprint) => sprint.state === 'planned')
    const completed = sprints.value
      .filter((sprint) => sprint.state === 'completed')
      .slice()
      .sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? ''))
    return [...active, ...planned, ...completed]
  })

  function pickDefaultSprint(list: Sprint[]) {
    const preferred = preferredSprintId?.value
    if (preferred && list.some((item) => item.id === preferred)) return preferred
    return (
      list.find((item) => item.state === 'active')?.id ??
      list.find((item) => item.state === 'planned')?.id ??
      list.find((item) => item.state === 'completed')?.id ??
      null
    )
  }

  async function loadIssues(ticket: number, id: string, sprintId: string | null | undefined) {
    const result = await issuesApi.list({
      projectId: id,
      ...(sprintId ? { sprintId } : {}),
      sort: 'position',
      order: 'asc',
      limit: BOARD_LIMIT,
    })
    if (!latest.isCurrent(ticket)) return
    issues.value = result.issues.filter((issue) => issue.type !== 'epic')
    hiddenCount.value = Math.max(0, result.total - result.issues.length)
    loadError.value = null
  }

  async function load() {
    if (isDragging.value) return
    const ticket = latest.start()
    const id = projectId.value
    try {
      const detail = await projects.fetchProject(id, true)
      const loadedSprints = detail.type === 'scrum' ? await sprintsApi.list(id) : []
      if (!latest.isCurrent(ticket)) return
      sprints.value = loadedSprints

      if (detail.type === 'scrum') {
        const stillValid = selectedSprintId.value && loadedSprints.some((sprint) => sprint.id === selectedSprintId.value)
        const preferred = preferredSprintId?.value
        const preferredValid = preferred && loadedSprints.some((sprint) => sprint.id === preferred)
        if (preferredValid && preferred !== selectedSprintId.value) selectedSprintId.value = preferred
        else if (!stillValid) selectedSprintId.value = pickDefaultSprint(loadedSprints)
        if (!selectedSprintId.value) {
          issues.value = []
          hiddenCount.value = 0
          loadError.value = null
          return
        }
        await loadIssues(ticket, id, selectedSprintId.value)
        return
      }

      selectedSprintId.value = null
      await loadIssues(ticket, id, null)
    } catch (error) {
      if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
    } finally {
      if (latest.isCurrent(ticket)) isLoading.value = false
    }
  }

  async function selectSprint(sprintId: string | null) {
    if (!sprintId || sprintId === selectedSprintId.value) return
    selectedSprintId.value = sprintId
    isLoading.value = true
    const ticket = latest.start()
    try {
      await loadIssues(ticket, projectId.value, sprintId)
    } catch (error) {
      if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
    } finally {
      if (latest.isCurrent(ticket)) isLoading.value = false
    }
  }

  watch(
    projectId,
    () => {
      selectedSprintId.value = null
      isLoading.value = true
      void load()
    },
    { immediate: true },
  )
  watch(
    () => preferredSprintId?.value,
    (preferred) => {
      if (!preferred || preferred === selectedSprintId.value) return
      if (!sprints.value.some((sprint) => sprint.id === preferred)) return
      void selectSprint(preferred)
    },
  )
  useProjectRealtime(projectId, load)

  return {
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
    reload: load,
  }
}
