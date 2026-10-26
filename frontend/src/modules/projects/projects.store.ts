import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { Project, ProjectDetail } from '@/types/models'
import { type ProjectChanges, type ProjectInput, projectsApi } from './projects.api'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const isLoaded = ref(false)
  const details = ref<Record<string, ProjectDetail>>({})
  const currentProjectId = ref<string | null>(null)

  const currentProject = computed(() => (currentProjectId.value ? details.value[currentProjectId.value] ?? null : null))
  const activeProjects = computed(() => projects.value.filter((project) => !project.archivedAt))
  /** Projects the person has joined (organization admins can also see the rest). */
  const joinedProjects = computed(() => activeProjects.value.filter((project) => project.isMember !== false))

  async function fetchProjects(force = false) {
    if (isLoaded.value && !force) return projects.value
    projects.value = await projectsApi.list()
    isLoaded.value = true
    return projects.value
  }

  function storeDetail(detail: ProjectDetail) {
    details.value[detail.id] = detail
    const index = projects.value.findIndex((project) => project.id === detail.id)
    if (index >= 0) projects.value[index] = { ...projects.value[index], ...detail }
    return detail
  }

  async function fetchProject(projectId: string, force = false) {
    if (details.value[projectId] && !force) return details.value[projectId]
    const detail = await projectsApi.get(projectId)
    // Opened from a link or notification of another organization the person belongs to: continue there.
    const auth = useAuthStore()
    if (detail.organizationId && auth.organization && detail.organizationId !== auth.organization.id) {
      await auth.switchOrganization(detail.organizationId, window.location.pathname + window.location.search)
      return new Promise<ProjectDetail>(() => {})
    }
    return storeDetail(detail)
  }

  async function createProject(input: ProjectInput) {
    const project = storeDetail(await projectsApi.create(input))
    await fetchProjects(true)
    return project
  }

  async function updateProject(projectId: string, changes: ProjectChanges) {
    return storeDetail(await projectsApi.update(projectId, changes))
  }

  async function deleteProject(projectId: string) {
    await projectsApi.remove(projectId)
    delete details.value[projectId]
    projects.value = projects.value.filter((project) => project.id !== projectId)
  }

  /** Your role in a project, from its details when loaded, otherwise from the project list. */
  const roleOf = (projectId?: string | null) =>
    projectId ? (details.value[projectId]?.myRole ?? projects.value.find((project) => project.id === projectId)?.myRole ?? null) : null
  const canEdit = (projectId?: string | null) => {
    const role = roleOf(projectId)
    return role === 'admin' || role === 'member'
  }
  const isAdmin = (projectId?: string | null) => (projectId ? details.value[projectId]?.myRole === 'admin' : false)

  return {
    projects,
    activeProjects,
    joinedProjects,
    details,
    currentProjectId,
    currentProject,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    canEdit,
    isAdmin,
  }
})
