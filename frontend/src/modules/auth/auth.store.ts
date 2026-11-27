import { isAxiosError } from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  currentTokenKey,
  getStoredToken,
  isSuperAdminTab,
  ORGANIZATION_STORAGE_KEY,
  SUPER_ADMIN_TOKEN_KEY,
  TOKEN_STORAGE_KEY,
  useTokenKey,
} from '@/lib/http'
import type { PlanFeatureKey } from '@/lib/plan-features'
import { http } from '@/lib/http'
import { clearPwaApiCaches } from '@/lib/pwa-caches'
import { connectRealtime, disconnectRealtime, getSocket, onSocketChange } from '@/lib/realtime'
import type { OrgPermission, OrganizationSummary, User, WorkspaceSettings } from '@/types/models'
import {
  authApi,
  isMfaChallenge,
  organizationsApi,
  type LoginResult,
  type ProfileChanges,
  type RegisterPayload,
  type Session,
  type SessionState,
} from './auth.api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getStoredToken())
  const user = ref<User | null>(null)
  /** The organization this browser works in; every API request is scoped to it. */
  const organization = ref<OrganizationSummary | null>(null)
  const organizations = ref<OrganizationSummary[]>([])
  const isAuthenticated = computed(() => Boolean(token.value && user.value))
  const isOrganizationAdmin = computed(() => organization.value?.role === 'admin')
  const isSuperAdmin = computed(() => Boolean(user.value?.isSuperAdmin))
  /** Mirrors the server: admins create organizations; people in none yet may create their first. The super admin reviews them instead. */
  const canCreateOrganization = computed(
    () => !isSuperAdmin.value && (!organizations.value.length || organizations.value.some((item) => item.role === 'admin')),
  )
  /** The current organization exists but the super admin has not approved it (pending or rejected). */
  const isOrganizationBlocked = computed(() => Boolean(organization.value && organization.value.status !== 'approved'))
  /** Whether the current organization's plan includes a feature (no plan information means full access). */
  const hasFeature = (key: PlanFeatureKey) => organization.value?.entitlements?.features?.[key] ?? true
  /** Built-in admin, or a custom role that includes the permission. */
  const hasPermission = (permission: OrgPermission) =>
    isOrganizationAdmin.value || Boolean(organization.value?.permissions?.includes(permission))
  /** Can open organization settings (any delegated workspace permission). */
  const canAccessWorkspaceAdmin = computed(
    () =>
      isOrganizationAdmin.value ||
      Boolean(
        organization.value?.permissions?.some((permission) =>
          [
            'workspace.manage',
            'workspace.people',
            'workspace.roles',
            'workspace.billing',
            'workspace.structure',
            'workspace.audit',
            'workspace.support',
          ].includes(permission),
        ),
      ),
  )

  function applyState(state: SessionState) {
    user.value = state.user
    organization.value = state.organization
    organizations.value = state.organizations
    // The super admin works outside organizations; leave the normal account's current organization alone.
    if (isSuperAdminTab()) return
    if (state.organization) localStorage.setItem(ORGANIZATION_STORAGE_KEY, state.organization.id)
    else localStorage.removeItem(ORGANIZATION_STORAGE_KEY)
  }

  /** The super admin's sign-in is stored apart from normal accounts, so both can stay open in different tabs. */
  function applySession(session: Session) {
    useTokenKey(session.user.isSuperAdmin ? SUPER_ADMIN_TOKEN_KEY : TOKEN_STORAGE_KEY)
    token.value = session.token
    localStorage.setItem(currentTokenKey(), session.token)
    applyState(session)
    connectRealtime()
  }

  /**
   * Tabs using the same sign-in share it (and the normal account's current organization). When another tab signs in
   * as someone else, signs out or switches organization, this tab reloads so it never shows one account while acting as another.
   */
  window.addEventListener('storage', (event) => {
    if (event.key === currentTokenKey() && event.newValue !== token.value) {
      window.location.replace(event.newValue ? (isSuperAdminTab() ? '/super-admin' : '/') : isSuperAdminTab() ? '/login?redirect=/super-admin' : '/login')
    } else if (event.key === ORGANIZATION_STORAGE_KEY && !isSuperAdminTab() && token.value && event.newValue !== organization.value?.id) {
      window.location.reload()
    }
  })

  const EMBED_FLAG = 'vector.embed'
  let embedWatchTimer: ReturnType<typeof setInterval> | null = null
  let stopEmbedSocketWatch: (() => void) | null = null

  function clearEmbedFlags() {
    try {
      sessionStorage.removeItem(EMBED_FLAG)
      sessionStorage.removeItem('vector.embed.pk')
    } catch {
      /* ignore */
    }
  }

  function stopEmbedSessionWatch() {
    if (embedWatchTimer) {
      clearInterval(embedWatchTimer)
      embedWatchTimer = null
    }
    stopEmbedSocketWatch?.()
    stopEmbedSocketWatch = null
    getSocket()?.off('embed:revoked')
  }

  function endEmbedSession() {
    if (typeof sessionStorage === 'undefined' || sessionStorage.getItem(EMBED_FLAG) !== '1') return
    stopEmbedSessionWatch()
    clearEmbedFlags()
    void logout('/embed?ended=1')
  }

  /**
   * Partner iframes: listen for embed:revoked (instant) and poll access by publishable key (backup).
   * Polling works even for older sessions that predate JWT embed claims.
   */
  function startEmbedSessionWatch() {
    stopEmbedSessionWatch()
    if (typeof sessionStorage === 'undefined' || sessionStorage.getItem(EMBED_FLAG) !== '1') return

    const onRevoked = () => endEmbedSession()
    stopEmbedSocketWatch = onSocketChange((socket) => {
      socket?.off('embed:revoked', onRevoked)
      socket?.on('embed:revoked', onRevoked)
    })

    const checkAccess = async () => {
      if (!token.value) return
      const pk = sessionStorage.getItem('vector.embed.pk')
      if (pk) {
        try {
          const { data } = await http.get<{ enabled: boolean }>(`/embed/apps/${encodeURIComponent(pk)}/access`)
          if (data?.enabled === false) {
            endEmbedSession()
            return
          }
        } catch {
          /* network blip — keep watching */
        }
      }
      try {
        await authApi.me()
      } catch (error) {
        if (isAuthError(error)) endEmbedSession()
      }
    }

    void checkAccess()
    embedWatchTimer = setInterval(() => {
      void checkAccess()
    }, 2_000)
  }

  function clearSession() {
    stopEmbedSessionWatch()
    token.value = null
    user.value = null
    organization.value = null
    organizations.value = []
    localStorage.removeItem(currentTokenKey())
    disconnectRealtime()
    void clearPwaApiCaches()
  }

  /**
   * Signs out and reloads the app on the sign-in page. The reload matters: every store (projects, inbox, structure…)
   * starts empty, so the next person to sign in never sees the previous account's data.
   */
  async function logout(redirect?: string) {
    const target = redirect ?? (isSuperAdminTab() ? '/super-admin' : undefined)
    clearSession()
    await clearPwaApiCaches()
    // Embed end screen is a real path (not a login redirect).
    if (target?.startsWith('/embed')) {
      window.location.replace(target)
      return
    }
    const query = target && target !== '/' ? `?redirect=${encodeURIComponent(target)}` : ''
    window.location.replace(`/login${query}`)
  }

  /**
   * Restores the session from a stored token on app start. Only a rejected token signs the person out; a server that is
   * restarting or a flaky network is retried, and the stored sign-in is kept either way.
   */
  async function restoreSession() {
    if (!token.value) return
    let state: SessionState | null = null
    for (const wait of [0, 1000, 2500, 5000]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        state = await authApi.me()
        break
      } catch (error) {
        if (isAuthError(error)) return clearSession()
      }
    }
    if (!state) return
    try {
      // Sign-ins saved before the super admin had its own slot move there, freeing the normal slot for another account.
      if (state.user.isSuperAdmin && !isSuperAdminTab()) {
        localStorage.setItem(SUPER_ADMIN_TOKEN_KEY, token.value)
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        useTokenKey(SUPER_ADMIN_TOKEN_KEY)
      }
      applyState(state)
      connectRealtime()
      startEmbedSessionWatch()
    } catch {
      clearSession()
    }
  }

  const isAuthError = (error: unknown) => isAxiosError(error) && error.response?.status === 401

  const refreshSession = async () => applyState(await authApi.me())

  /** Completes Google/Microsoft sign-in when the OAuth callback returned a session JWT. */
  async function acceptOAuthToken(rawToken: string) {
    useTokenKey(TOKEN_STORAGE_KEY)
    token.value = rawToken
    localStorage.setItem(TOKEN_STORAGE_KEY, rawToken)
    applyState(await authApi.me())
    if (user.value?.isSuperAdmin) {
      localStorage.setItem(SUPER_ADMIN_TOKEN_KEY, rawToken)
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      useTokenKey(SUPER_ADMIN_TOKEN_KEY)
    }
    connectRealtime()
    startEmbedSessionWatch()
  }

  /** Returns an MFA challenge when two-factor is on; otherwise applies the session. */
  async function login(payload: { email: string; password: string }): Promise<LoginResult> {
    const result = await authApi.login(payload)
    if (!isMfaChallenge(result)) applySession(result)
    return result
  }
  const verifyMfaLogin = async (payload: { mfaToken: string; code?: string; recoveryCode?: string }) =>
    applySession(await authApi.verifyMfaLogin(payload))
  const register = async (payload: RegisterPayload) => applySession(await authApi.register(payload))
  const resetPassword = async (payload: { token: string; password: string }) => applySession(await authApi.resetPassword(payload))
  const acceptInvite = async (payload: { token: string; name: string; password: string }) =>
    applySession(await authApi.acceptInvite(payload))
  /** One-click invitation: signs in and returns the temporary password to show once. */
  async function acceptInviteQuick(inviteToken: string) {
    const { temporaryPassword, ...session } = await authApi.acceptInviteQuick(inviteToken)
    applySession(session)
    return temporaryPassword
  }

  /**
   * Opens another organization. The page reloads at `path` so nothing from the previous organization
   * (projects, people, caches) carries over.
   */
  async function switchOrganization(organizationId: string, path = '/') {
    applyState(await organizationsApi.switchTo(organizationId))
    await clearPwaApiCaches()
    window.location.assign(path)
  }

  async function createOrganization(payload: { name: string; slug: string }) {
    applyState(await organizationsApi.create(payload))
    await clearPwaApiCaches()
    window.location.assign('/projects?welcome=1')
  }

  /** Keeps the current organization in sync after an admin renames it or changes its address. */
  function patchOrganization(settings: WorkspaceSettings & { id?: string }) {
    if (!organization.value || (settings.id && settings.id !== organization.value.id)) return
    const next = {
      ...organization.value,
      name: settings.name,
      slug: settings.slug ?? organization.value.slug,
      defaultMode: settings.defaultMode,
      logoUrl: settings.logoUrl !== undefined ? settings.logoUrl : organization.value.logoUrl,
      brandColor: settings.brandColor !== undefined ? settings.brandColor : organization.value.brandColor,
      brandBrightness:
        settings.brandBrightness !== undefined ? settings.brandBrightness : organization.value.brandBrightness,
      requireMfa: settings.requireMfa !== undefined ? settings.requireMfa : organization.value.requireMfa,
      sso: settings.sso !== undefined ? settings.sso : organization.value.sso,
      channelNotifications:
        settings.channelNotifications !== undefined
          ? settings.channelNotifications
          : organization.value.channelNotifications,
      retention: settings.retention !== undefined ? settings.retention : organization.value.retention,
      invitePolicy: settings.invitePolicy !== undefined ? settings.invitePolicy : organization.value.invitePolicy,
      capacity: settings.capacity !== undefined ? settings.capacity : organization.value.capacity,
      aiGrounding: settings.aiGrounding !== undefined ? settings.aiGrounding : organization.value.aiGrounding,
      status: settings.status ?? organization.value.status,
      entitlements: settings.entitlements?.features
        ? settings.entitlements
        : organization.value.entitlements,
      rejectionReason: settings.rejectionReason !== undefined ? settings.rejectionReason : organization.value.rejectionReason,
    }
    organization.value = next
    organizations.value = organizations.value.map((item) => (item.id === next.id ? { ...item, ...next } : item))
    if (user.value) {
      user.value = {
        ...user.value,
        mfaSetupRequired: Boolean(next.requireMfa && !user.value.mfaEnabled),
      }
    }
  }

  /** Profile responses carry the role in the current organization; keep it whatever endpoint answered. */
  const withRole = (next: User) => ({
    ...next,
    workspaceRole: organization.value?.role ?? next.workspaceRole,
    isSuperAdmin: next.isSuperAdmin ?? user.value?.isSuperAdmin,
  })

  async function updateProfile(changes: ProfileChanges) {
    user.value = withRole(await authApi.updateProfile(changes))
  }

  async function uploadAvatar(image: Blob, fileName: string) {
    user.value = withRole(await authApi.uploadAvatar(image, fileName))
  }

  async function removeAvatar() {
    user.value = withRole(await authApi.removeAvatar())
  }

  async function uploadRingtone(file: File) {
    user.value = withRole(await authApi.uploadRingtone(file))
  }

  async function removeRingtone() {
    user.value = withRole(await authApi.removeRingtone())
  }

  /** Signs out every other browser; this one keeps working with the new token the server returns. */
  async function changePassword(payload: { currentPassword?: string; newPassword: string }) {
    const { token: next } = await authApi.changePassword(payload)
    token.value = next
    localStorage.setItem(currentTokenKey(), next)
    if (user.value) {
      user.value = {
        ...user.value,
        mustChangePassword: false,
        hasPassword: true,
        authProviders: {
          password: true,
          google: user.value.authProviders?.google ?? false,
          microsoft: user.value.authProviders?.microsoft ?? false,
          oidc: user.value.authProviders?.oidc ?? false,
        },
      }
    }
    connectRealtime()
  }

  async function revokeOtherSessions() {
    const { token: next } = await authApi.revokeOtherSessions()
    token.value = next
    localStorage.setItem(currentTokenKey(), next)
    connectRealtime()
  }

  return {
    token,
    user,
    organization,
    organizations,
    isAuthenticated,
    isOrganizationAdmin,
    canAccessWorkspaceAdmin,
    canCreateOrganization,
    isSuperAdmin,
    isOrganizationBlocked,
    hasFeature,
    hasPermission,
    restoreSession,
    refreshSession,
    acceptOAuthToken,
    login,
    verifyMfaLogin,
    register,
    resetPassword,
    acceptInvite,
    acceptInviteQuick,
    switchOrganization,
    createOrganization,
    patchOrganization,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    uploadRingtone,
    removeRingtone,
    changePassword,
    revokeOtherSessions,
    logout,
  }
})
