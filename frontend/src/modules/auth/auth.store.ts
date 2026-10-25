import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ORGANIZATION_STORAGE_KEY, TOKEN_STORAGE_KEY } from '@/lib/http'
import { connectRealtime, disconnectRealtime } from '@/lib/realtime'
import type { OrganizationSummary, User, WorkspaceSettings } from '@/types/models'
import { authApi, organizationsApi, type ProfileChanges, type RegisterPayload, type Session, type SessionState } from './auth.api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY))
  const user = ref<User | null>(null)
  /** The organization this browser works in; every API request is scoped to it. */
  const organization = ref<OrganizationSummary | null>(null)
  const organizations = ref<OrganizationSummary[]>([])
  const isAuthenticated = computed(() => Boolean(token.value && user.value))
  const isOrganizationAdmin = computed(() => organization.value?.role === 'admin')

  function applyState(state: SessionState) {
    user.value = state.user
    organization.value = state.organization
    organizations.value = state.organizations
    if (state.organization) localStorage.setItem(ORGANIZATION_STORAGE_KEY, state.organization.id)
    else localStorage.removeItem(ORGANIZATION_STORAGE_KEY)
  }

  function applySession(session: Session) {
    token.value = session.token
    localStorage.setItem(TOKEN_STORAGE_KEY, session.token)
    applyState(session)
    connectRealtime()
  }

  function clearSession() {
    token.value = null
    user.value = null
    organization.value = null
    organizations.value = []
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    disconnectRealtime()
    if ('caches' in window) void caches.delete('vector-api')
  }

  /** Restores the session from a stored token on app start. */
  async function restoreSession() {
    if (!token.value) return
    try {
      applyState(await authApi.me())
      connectRealtime()
    } catch {
      clearSession()
    }
  }

  const refreshSession = async () => applyState(await authApi.me())

  const login = async (payload: { email: string; password: string }) => applySession(await authApi.login(payload))
  const register = async (payload: RegisterPayload) => applySession(await authApi.register(payload))
  const resetPassword = async (payload: { token: string; password: string }) => applySession(await authApi.resetPassword(payload))
  const acceptInvite = async (payload: { token: string; name: string; password: string }) =>
    applySession(await authApi.acceptInvite(payload))

  /**
   * Opens another organization. The page reloads at `path` so nothing from the previous organization
   * (projects, people, caches) carries over.
   */
  async function switchOrganization(organizationId: string, path = '/') {
    applyState(await organizationsApi.switchTo(organizationId))
    if ('caches' in window) await caches.delete('vector-api').catch(() => false)
    window.location.assign(path)
  }

  async function createOrganization(payload: { name: string; slug: string }) {
    applyState(await organizationsApi.create(payload))
    if ('caches' in window) await caches.delete('vector-api').catch(() => false)
    window.location.assign('/projects?welcome=1')
  }

  /** Keeps the current organization in sync after an admin renames it or changes its address. */
  function patchOrganization(settings: WorkspaceSettings & { id?: string }) {
    if (!organization.value || (settings.id && settings.id !== organization.value.id)) return
    const next = { ...organization.value, name: settings.name, slug: settings.slug ?? organization.value.slug, defaultMode: settings.defaultMode }
    organization.value = next
    organizations.value = organizations.value.map((item) => (item.id === next.id ? { ...item, ...next } : item))
  }

  /** Profile responses carry the role in the current organization; keep it whatever endpoint answered. */
  const withRole = (next: User) => ({ ...next, workspaceRole: organization.value?.role ?? next.workspaceRole })

  async function updateProfile(changes: ProfileChanges) {
    user.value = withRole(await authApi.updateProfile(changes))
  }

  async function uploadAvatar(image: Blob, fileName: string) {
    user.value = withRole(await authApi.uploadAvatar(image, fileName))
  }

  async function removeAvatar() {
    user.value = withRole(await authApi.removeAvatar())
  }

  return {
    token,
    user,
    organization,
    organizations,
    isAuthenticated,
    isOrganizationAdmin,
    restoreSession,
    refreshSession,
    login,
    register,
    resetPassword,
    acceptInvite,
    switchOrganization,
    createOrganization,
    patchOrganization,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    logout: clearSession,
  }
})
