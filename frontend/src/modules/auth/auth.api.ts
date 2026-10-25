import { http } from '@/lib/http'
import type { OrganizationSummary, User, UserPreferences, WorkspaceSettings } from '@/types/models'

/** The signed-in person, the organization they are working in and every organization they can switch to. */
export interface SessionState {
  user: User
  organization: OrganizationSummary | null
  organizations: OrganizationSummary[]
}

export interface Session extends SessionState {
  token: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  organizationName: string
  organizationSlug: string
}

export interface SlugCheck {
  slug: string
  available: boolean
  suggestion: string | null
  reason: string | null
}

export interface ProfileChanges {
  name?: string
  title?: string | null
  timezone?: string
  avatarColor?: string
  preferences?: Partial<UserPreferences>
}

export const authApi = {
  login: (payload: { email: string; password: string }) => http.post<Session>('/auth/login', payload).then((r) => r.data),
  register: (payload: RegisterPayload) => http.post<Session>('/auth/register', payload).then((r) => r.data),
  forgotPassword: (email: string) => http.post<{ message: string }>('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload: { token: string; password: string }) =>
    http.post<Session>('/auth/reset-password', payload).then((r) => r.data),
  acceptInvite: (payload: { token: string; name: string; password: string }) =>
    http.post<Session>('/auth/accept-invite', payload).then((r) => r.data),
  me: () => http.get<SessionState>('/auth/me').then((r) => r.data),
  updateProfile: (changes: ProfileChanges) => http.patch<{ user: User }>('/auth/me', changes).then((r) => r.data.user),
  uploadAvatar: (image: Blob, fileName: string) => {
    const form = new FormData()
    form.append('avatar', image, fileName)
    return http.post<{ user: User }>('/users/me/avatar', form).then((r) => r.data.user)
  },
  removeAvatar: () => http.delete<{ user: User }>('/users/me/avatar').then((r) => r.data.user),
  changePassword: (payload: { currentPassword: string; newPassword: string }) => http.patch('/auth/me/password', payload),
}

export const organizationsApi = {
  checkSlug: (slug: string) => http.get<SlugCheck>('/organizations/check-slug', { params: { slug } }).then((r) => r.data),
  publicInfo: (slug: string) =>
    http.get<{ organization: Required<Pick<WorkspaceSettings, 'name' | 'slug' | 'defaultMode'>> }>(`/organizations/by-slug/${slug}`).then((r) => r.data.organization),
  create: (payload: { name: string; slug: string }) => http.post<SessionState>('/organizations', payload).then((r) => r.data),
  switchTo: (organizationId: string) => http.post<SessionState>(`/organizations/${organizationId}/switch`).then((r) => r.data),
}
