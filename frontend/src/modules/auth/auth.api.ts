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

/** Password accepted; authenticator or recovery code still required. */
export interface MfaChallenge {
  mfaRequired: true
  mfaToken: string
}

export type LoginResult = Session | MfaChallenge

export const isMfaChallenge = (result: LoginResult): result is MfaChallenge => 'mfaRequired' in result && result.mfaRequired === true

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
  about?: string | null
  location?: string | null
  phone?: string | null
  skills?: string[]
  timezone?: string
  avatarColor?: string
  preferences?: Partial<UserPreferences>
}

export const authApi = {
  login: (payload: { email: string; password: string }) => http.post<LoginResult>('/auth/login', payload).then((r) => r.data),
  verifyMfaLogin: (payload: { mfaToken: string; code?: string; recoveryCode?: string }) =>
    http.post<Session>('/auth/login/mfa', payload).then((r) => r.data),
  setupMfa: () => http.post<{ secret: string; otpauthUrl: string }>('/auth/me/mfa/setup').then((r) => r.data),
  confirmMfa: (code: string) => http.post<{ recoveryCodes: string[]; user: User }>('/auth/me/mfa/confirm', { code }).then((r) => r.data),
  disableMfa: (payload: { password: string; code?: string; recoveryCode?: string }) =>
    http.post<{ user: User }>('/auth/me/mfa/disable', payload).then((r) => r.data.user),
  regenerateMfaRecovery: (payload: { password: string; code: string }) =>
    http.post<{ recoveryCodes: string[] }>('/auth/me/mfa/recovery', payload).then((r) => r.data.recoveryCodes),
  register: (payload: RegisterPayload) => http.post<Session>('/auth/register', payload).then((r) => r.data),
  forgotPassword: (email: string) => http.post<{ message: string }>('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload: { token: string; password: string }) =>
    http.post<Session>('/auth/reset-password', payload).then((r) => r.data),
  acceptInvite: (payload: { token: string; name: string; password: string }) =>
    http.post<Session>('/auth/accept-invite', payload).then((r) => r.data),
  /** One click from the invitation email: the account is ready, with a temporary password shown once (and emailed). */
  acceptInviteQuick: (token: string) =>
    http.post<Session & { temporaryPassword: string }>('/auth/accept-invite/quick', { token }).then((r) => r.data),
  me: () => http.get<SessionState>('/auth/me').then((r) => r.data),
  updateProfile: (changes: ProfileChanges) => http.patch<{ user: User }>('/auth/me', changes).then((r) => r.data.user),
  uploadAvatar: (image: Blob, fileName: string) => {
    const form = new FormData()
    form.append('avatar', image, fileName)
    return http.post<{ user: User }>('/users/me/avatar', form).then((r) => r.data.user)
  },
  removeAvatar: () => http.delete<{ user: User }>('/users/me/avatar').then((r) => r.data.user),
  uploadRingtone: (file: File) => {
    const form = new FormData()
    form.append('ringtone', file, file.name)
    return http.post<{ user: User }>('/users/me/ringtone', form).then((r) => r.data.user)
  },
  removeRingtone: () => http.delete<{ user: User }>('/users/me/ringtone').then((r) => r.data.user),
  /** Signs out every other session; the returned token keeps this one signed in. */
  changePassword: (payload: { currentPassword?: string; newPassword: string }) => http.patch<{ token: string }>('/auth/me/password', payload).then((r) => r.data),
  revokeOtherSessions: () => http.post<{ token: string }>('/auth/me/sessions/revoke-others').then((r) => r.data),
  listApiTokens: () => http.get<{ tokens: ApiTokenInfo[] }>('/auth/me/tokens').then((r) => r.data.tokens),
  createApiToken: (payload: { name: string; expiresInDays?: number | null }) =>
    http.post<ApiTokenInfo & { token: string }>('/auth/me/tokens', payload).then((r) => r.data),
  revokeApiToken: (tokenId: string) => http.delete(`/auth/me/tokens/${tokenId}`),
  /** Downloads a JSON export of profile, memberships, preferences and issue keys. */
  exportAccount: async () => {
    const response = await http.get<Blob>('/auth/me/export', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    Object.assign(document.createElement('a'), { href: url, download: 'vector-account-export.json' }).click()
    URL.revokeObjectURL(url)
  },
  /** Soft-deletes the account after password confirmation. */
  deleteAccount: (password: string) => http.delete('/auth/me', { data: { password } }),
}

export interface ApiTokenInfo {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export const organizationsApi = {
  checkSlug: (slug: string) => http.get<SlugCheck>('/organizations/check-slug', { params: { slug } }).then((r) => r.data),
  publicInfo: (slug: string) =>
    http
      .get<{
        organization: Required<Pick<WorkspaceSettings, 'name' | 'slug' | 'defaultMode'>> & {
          brandColor?: string | null
          logoUrl?: string | null
        }
      }>(`/organizations/by-slug/${slug}`)
      .then((r) => r.data.organization),
  create: (payload: { name: string; slug: string }) => http.post<SessionState>('/organizations', payload).then((r) => r.data),
  switchTo: (organizationId: string) => http.post<SessionState>(`/organizations/${organizationId}/switch`).then((r) => r.data),
}
