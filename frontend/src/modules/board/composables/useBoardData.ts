import { computed, type Ref, ref, watch } from 'vue'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import { issuesApi } from '@/modules/issues/api/issues.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Issue, Sprint } from '@/types/models'

/** The most tasks a board shows at once; beyond it the board says so and points to the list. */
export const BOARD_LIMIT = 1000

/** Loads everything a board needs: project workflow, the active sprint (scrum) and its issues. */
export function useBoardData(projectId: Ref<string>) {
  const projects = useProjectsStore()
  const issues = ref<Issue[]>([])
  const sprints = ref<Sprint[]>([])
  const isLoading = ref(true)
  const isDragging = ref(false)
  /** Why the board did not load (shown with a retry), or null. */
  const loadError = ref<string | null>(null)
  /** How many tasks exist in total, when more than the board shows. */
  const hiddenCount = ref(0)
  const latest = latestRequest()

  const project = computed(() => projects.details[projectId.value] ?? null)
  const activeSprint = computed(() => sprints.value.find((sprint) => sprint.state === 'active') ?? null)
  const isScrum = computed(() => project.value?.type === 'scrum')

  async function load() {
    if (isDragging.value) return
    const ticket = latest.start()
    const id = projectId.value
    try {
      const detail = await projects.fetchProject(id)
      const loadedSprints = detail.type === 'scrum' ? await sprintsApi.list(id) : []
      const sprint = loadedSprints.find((item) => item.state === 'active') ?? null
      if (detail.type === 'scrum' && !sprint) {
        if (!latest.isCurrent(ticket)) return
        sprints.value = loadedSprints
        issues.value = []
        hiddenCount.value = 0
        loadError.value = null
        return
      }
      const result = await issuesApi.list({ projectId: id, sprintId: sprint?.id, sort: 'position', order: 'asc', limit: BOARD_LIMIT })
      if (!latest.isCurrent(ticket)) return
      sprints.value = loadedSprints
      issues.value = result.issues.filter((issue) => issue.type !== 'epic')
      hiddenCount.value = Math.max(0, result.total - result.issues.length)
      loadError.value = null
    } catch (error) {
      if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
    } finally {
      if (latest.isCurrent(ticket)) isLoading.value = false
    }
  }

  watch(
    projectId,
    () => {
      isLoading.value = true
      void load()
    },
    { immediate: true },
  )
  useProjectRealtime(projectId, load)

  return { project, issues, sprints, activeSprint, isScrum, isLoading, isDragging, loadError, hiddenCount, reload: load }
}
