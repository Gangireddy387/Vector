import { http } from '@/lib/http'
import type { Department, TeamWork } from '@/types/models'

export interface DepartmentInput {
  name: string
  description: string | null
  headId: string | null
}

export interface TeamInput {
  name: string
  description: string | null
  leadId: string | null
  memberIds: string[]
  departmentId?: string
}

/** Every change answers with the whole structure, so pages always show the saved state. */
const departments = (request: Promise<{ data: { departments: Department[] } }>) => request.then((r) => r.data.departments)

export const structureApi = {
  list: () => departments(http.get('/departments')),
  createDepartment: (input: DepartmentInput) => departments(http.post('/departments', input)),
  updateDepartment: (departmentId: string, changes: Partial<DepartmentInput>) => departments(http.patch(`/departments/${departmentId}`, changes)),
  removeDepartment: (departmentId: string) => departments(http.delete(`/departments/${departmentId}`)),
  createTeam: (departmentId: string, input: TeamInput) => departments(http.post(`/departments/${departmentId}/teams`, input)),
  updateTeam: (teamId: string, changes: Partial<TeamInput>) => departments(http.patch(`/teams/${teamId}`, changes)),
  removeTeam: (teamId: string) => departments(http.delete(`/teams/${teamId}`)),

  departmentProjects: (departmentId: string) =>
    http.get<{ teams: Array<{ id: string; name: string; projects: TeamWork['projects'] }> }>(`/departments/${departmentId}/projects`).then((r) => r.data.teams),
  teamWork: (teamId: string) => http.get<TeamWork>(`/teams/${teamId}/work`).then((r) => r.data),
  addProject: (teamId: string, projectId: string) => http.post<TeamWork>(`/teams/${teamId}/projects`, { projectId }).then((r) => r.data),
  removeProject: (teamId: string, projectId: string) => http.delete<TeamWork>(`/teams/${teamId}/projects/${projectId}`).then((r) => r.data),
}
