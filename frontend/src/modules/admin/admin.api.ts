import { http } from '@/lib/http'
import type { Activity, Entitlements, ProjectRole, UserSummary, WorkspaceMember, WorkspaceRole, WorkspaceSettings } from '@/types/models'

type ProjectBadge = { id: string; name: string; key: string; color: string }

/** What an organization admin sees on someone's profile page. */
export interface MemberProfile {
  person: UserSummary & {
    status: 'active' | 'invited' | 'disabled'
    membershipStatus: 'active' | 'disabled'
    workspaceRole: WorkspaceRole
    timezone: string
    about: string | null
    location: string | null
    phone: string | null
    skills: string[]
    lastSeenAt: string | null
    createdAt: string
    joinedAt: string
  }
  structure: {
    headOf: Array<{ id: string; name: string }>
    teams: Array<{ id: string; name: string; isLead: boolean; department: { id: string; name: string } | null }>
  }
  projects: Array<ProjectBadge & { role: ProjectRole; viaTeam: boolean; openTasks: number; doneTasks: number }>
  stats: {
    openTasks: number
    overdueTasks: number
    completedRecently: number
    completedTotal: number
    minutesLoggedRecently: number
    commentsRecently: number
    recentDays: number
  }
  activity: Activity[]
  recentlyCompleted: Array<{ id: string; key: string; title: string; completedAt: string; project: ProjectBadge | null }>
}

/** The current organization's settings and people (organization admins). */
export const workspaceApi = {
  get: () => http.get<{ settings: WorkspaceSettings }>('/workspace').then((r) => r.data.settings),
  update: (changes: Partial<Omit<WorkspaceSettings, 'updatedAt'>>) =>
    http.patch<{ settings: WorkspaceSettings & { id: string } }>('/workspace', changes).then((r) => r.data.settings),
  remove: (confirmName: string) => http.delete('/workspace', { data: { confirmName } }),
  plan: () => http.get<{ entitlements: Entitlements; usage: { members: number; projects: number } }>('/workspace/plan').then((r) => r.data),
  uploadLogo: (image: Blob, fileName: string) => {
    const form = new FormData()
    form.append('logo', image, fileName)
    return http.post<{ settings: WorkspaceSettings & { id: string } }>('/workspace/logo', form).then((r) => r.data.settings)
  },
  removeLogo: () => http.delete<{ settings: WorkspaceSettings & { id: string } }>('/workspace/logo').then((r) => r.data.settings),
  members: () => http.get<{ members: WorkspaceMember[] }>('/workspace/members').then((r) => r.data.members),
  memberProfile: (userId: string) => http.get<MemberProfile>(`/workspace/members/${userId}/profile`).then((r) => r.data),
  invite: (payload: { email: string; role: WorkspaceRole }) =>
    http.post<{ member: WorkspaceMember & { invited: boolean } }>('/workspace/invitations', payload).then((r) => r.data.member),
  updateMember: (userId: string, changes: { workspaceRole?: WorkspaceRole; status?: 'active' | 'disabled' }) =>
    http.patch(`/workspace/members/${userId}`, changes),
  removeMember: (userId: string) => http.delete(`/workspace/members/${userId}`),
}
