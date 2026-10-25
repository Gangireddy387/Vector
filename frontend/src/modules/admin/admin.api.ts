import { http } from '@/lib/http'
import type { WorkspaceMember, WorkspaceRole, WorkspaceSettings } from '@/types/models'

/** The current organization's settings and people (organization admins). */
export const workspaceApi = {
  get: () => http.get<{ settings: WorkspaceSettings }>('/workspace').then((r) => r.data.settings),
  update: (changes: Partial<Omit<WorkspaceSettings, 'updatedAt'>>) =>
    http.patch<{ settings: WorkspaceSettings & { id: string } }>('/workspace', changes).then((r) => r.data.settings),
  remove: (confirmName: string) => http.delete('/workspace', { data: { confirmName } }),
  members: () => http.get<{ members: WorkspaceMember[] }>('/workspace/members').then((r) => r.data.members),
  invite: (payload: { email: string; role: WorkspaceRole }) =>
    http.post<{ member: WorkspaceMember & { invited: boolean } }>('/workspace/invitations', payload).then((r) => r.data.member),
  updateMember: (userId: string, changes: { workspaceRole?: WorkspaceRole; status?: 'active' | 'disabled' }) =>
    http.patch(`/workspace/members/${userId}`, changes),
  removeMember: (userId: string) => http.delete(`/workspace/members/${userId}`),
}
