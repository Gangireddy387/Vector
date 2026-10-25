import { computed, type Ref, ref, watch } from 'vue'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { issuesApi } from '@/modules/issues/api/issues.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { Issue, Sprint } from '@/types/models'

/** Loads everything a board needs: project workflow, the active sprint (scrum) and its issues. */
export function useBoardData(projectId: Ref<string>) {
  const projects = useProjectsStore()
  const issues = ref<Issue[]>([])
  const sprints = ref<Sprint[]>([])
  const isLoading = ref(true)
  const isDragging = ref(false)

  const project = computed(() => projects.details[projectId.value] ?? null)
  const activeSprint = computed(() => sprints.value.find((sprint) => sprint.state === 'active') ?? null)
  const isScrum = computed(() => project.value?.type === 'scrum')

  async function load() {
    if (isDragging.value) return
    const detail = await projects.fetchProject(projectId.value)
    sprints.value = detail.type === 'scrum' ? await sprintsApi.list(projectId.value) : []
    if (detail.type === 'scrum' && !activeSprint.value) {
      issues.value = []
      isLoading.value = false
      return
    }
    const { issues: loaded } = await issuesApi.list({
      projectId: projectId.value,
      sprintId: activeSprint.value?.id,
      sort: 'position',
      order: 'asc',
      limit: 1000,
    })
    issues.value = loaded.filter((issue) => issue.type !== 'epic')
    isLoading.value = false
  }

  watch(projectId, () => {
    isLoading.value = true
    void load()
  }, { immediate: true })
  useProjectRealtime(projectId, load)

  return { project, issues, sprints, activeSprint, isScrum, isLoading, isDragging, reload: load }
}
