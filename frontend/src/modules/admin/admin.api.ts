import { http } from '@/lib/http'
import type {
  Activity,
  Entitlements,
  OrganizationRole,
  OrgPermission,
  ProjectRole,
  UserSummary,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSettings,
} from '@/types/models'

type ProjectBadge = { id: string; name: string; key: string; color: string }

export type UpgradeTarget = 'pro' | 'enterprise' | 'seats' | 'projects'
export type BillingPlan = 'pro' | 'enterprise'

export interface WebhookEndpointRow {
  id: string
  name: string
  url: string
  secretPrefix: string
  events: string[]
  enabled: boolean
  lastDeliveryAt: string | null
  lastStatus: number | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface UpgradeRequest {
  target: UpgradeTarget
  note: string | null
  requestedByName: string | null
  createdAt: string
  status: 'pending'
}

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
  plan: () =>
    http
      .get<{
        entitlements: Entitlements
        usage: { members: number; projects: number }
        upgradeRequest: UpgradeRequest | null
      }>('/workspace/plan')
      .then((r) => r.data),
  /** Ask the portal admin to upgrade Pro / raise seat or project limits. */
  requestUpgrade: (payload: { target: UpgradeTarget; note?: string }) =>
    http
      .post<{ upgradeRequest: UpgradeRequest; alreadyPending: boolean }>('/workspace/plan/upgrade-request', payload)
      .then((r) => r.data),
  /** Day-2 / day-7 workday nudge open rates (in-app readAt). */
  workdayNudgeMetrics: () =>
    http
      .get<{
        sent: number
        opened: number
        openRate: number
        readWithoutClick?: number
        byDay: Record<string, { sent: number; opened: number; openRate: number }>
      }>('/workspace/metrics/workday-nudges')
      .then((r) => r.data),
  uploadLogo: (image: Blob, fileName: string) => {
    const form = new FormData()
    form.append('logo', image, fileName)
    return http.post<{ settings: WorkspaceSettings & { id: string } }>('/workspace/logo', form).then((r) => r.data.settings)
  },
  removeLogo: () => http.delete<{ settings: WorkspaceSettings & { id: string } }>('/workspace/logo').then((r) => r.data.settings),
  members: () => http.get<{ members: WorkspaceMember[] }>('/workspace/members').then((r) => r.data.members),
  memberProfile: (userId: string) => http.get<MemberProfile>(`/workspace/members/${userId}/profile`).then((r) => r.data),
  invite: (payload: { email: string; role: WorkspaceRole; customRoleId?: string | null }) =>
    http
      .post<{ member: WorkspaceMember & { invited: boolean; emailed: boolean; inviteLink: string | null } }>('/workspace/invitations', payload)
      .then((r) => r.data.member),
  updateMember: (
    userId: string,
    changes: { workspaceRole?: WorkspaceRole; status?: 'active' | 'disabled'; customRoleId?: string | null },
  ) => http.patch(`/workspace/members/${userId}`, changes),
  removeMember: (userId: string) => http.delete(`/workspace/members/${userId}`),
  rolePermissions: () =>
    http
      .get<{ permissions: Array<{ key: OrgPermission; label: string; description: string }> }>('/workspace/roles/permissions')
      .then((r) => r.data.permissions),
  roles: () => http.get<{ roles: OrganizationRole[] }>('/workspace/roles').then((r) => r.data.roles),
  createRole: (input: { name: string; description?: string | null; permissions: OrgPermission[]; key?: string }) =>
    http.post<{ role: OrganizationRole }>('/workspace/roles', input).then((r) => r.data.role),
  updateRole: (
    roleId: string,
    changes: { name?: string; description?: string | null; permissions?: OrgPermission[]; position?: number },
  ) => http.patch<{ role: OrganizationRole }>(`/workspace/roles/${roleId}`, changes).then((r) => r.data.role),
  removeRole: (roleId: string) => http.delete(`/workspace/roles/${roleId}`),
  /** A new invitation for someone who has not accepted yet; without invitation emails the link comes back to share. */
  resendInvitation: (userId: string) =>
    http.post<{ emailed: boolean; inviteLink: string | null }>(`/workspace/members/${userId}/resend-invitation`).then((r) => r.data),
  /** Organization audit trail (invites, roles, settings, plan, sign-in / SSO / MFA). */
  auditLog: (params?: { limit?: number; before?: string; category?: 'auth' | 'admin' }) =>
    http.get<{ entries: WorkspaceAuditEntry[] }>('/workspace/audit-log', { params }).then((r) => r.data),
  exportAuditLogCsv: async (category?: 'auth' | 'admin') => {
    const response = await http.get<Blob>('/workspace/audit-log/export', {
      params: category ? { category } : undefined,
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    Object.assign(document.createElement('a'), { href: url, download: 'vector-audit-log.csv' }).click()
    URL.revokeObjectURL(url)
  },
  scimSettings: () => http.get<{ scim: { available: boolean; baseUrl: string | null } }>('/workspace/scim').then((r) => r.data.scim),
  scimTokens: () =>
    http
      .get<{ tokens: Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }>; baseUrl: string }>(
        '/workspace/scim/tokens',
      )
      .then((r) => r.data),
  createScimToken: (name: string) =>
    http
      .post<{
        token: string
        id: string
        name: string
        prefix: string
        lastUsedAt: string | null
        createdAt: string
        baseUrl: string
      }>('/workspace/scim/tokens', { name })
      .then((r) => r.data),
  revokeScimToken: (tokenId: string) => http.delete(`/workspace/scim/tokens/${tokenId}`),
  webhooks: () =>
    http
      .get<{ endpoints: WebhookEndpointRow[]; events: string[] }>('/workspace/webhooks')
      .then((r) => r.data),
  createWebhook: (payload: { name: string; url: string; events: string[]; enabled?: boolean }) =>
    http.post<WebhookEndpointRow & { secret: string }>('/workspace/webhooks', payload).then((r) => r.data),
  updateWebhook: (endpointId: string, payload: Partial<{ name: string; url: string; events: string[]; enabled: boolean }>) =>
    http.patch<WebhookEndpointRow>(`/workspace/webhooks/${endpointId}`, payload).then((r) => r.data),
  deleteWebhook: (endpointId: string) => http.delete(`/workspace/webhooks/${endpointId}`),
  testWebhook: (endpointId: string) =>
    http.post<WebhookEndpointRow & { ok: boolean; status: number }>(`/workspace/webhooks/${endpointId}/test`).then((r) => r.data),
  /** Full organization JSON backup (projects, issues, comments, attachment metadata). */
  exportBackup: async (slug?: string | null) => {
    const response = await http.get<Blob>('/workspace/backup', { responseType: 'blob' })
    const safe = String(slug || 'workspace').replace(/[^\w.-]+/g, '_')
    const url = URL.createObjectURL(response.data)
    Object.assign(document.createElement('a'), { href: url, download: `vector-${safe}-backup.json` }).click()
    URL.revokeObjectURL(url)
  },
  /** Merge-import a Vector org backup JSON (creates new projects; matches people by email). */
  importBackup: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http
      .post<{
        projectsCreated: number
        issuesCreated: number
        departmentsCreated: number
        teamsCreated: number
        remappedKeys: Array<{ from: string; to: string }>
        skipped: { attachments: number; unknownEmails: string[]; billing: boolean; users: boolean }
        warnings: string[]
      }>('/workspace/backup/import', form)
      .then((r) => r.data)
  },
  billingStatus: () =>
    http
      .get<{
        checkoutEnabled: boolean
        proCheckoutEnabled: boolean
        enterpriseCheckoutEnabled: boolean
        trialDays: number
        enterpriseTrialDays: number
        portalEnabled: boolean
        hasSubscription: boolean
        billedSeats: number | null
        minSeats: number
        maxSeats: number
      }>('/billing/status')
      .then((r) => r.data),
  startCheckout: (seats?: number, plan: BillingPlan = 'pro') =>
    http
      .post<{
        url: string | null
        seats: number
        mode: 'checkout' | 'updated' | 'unchanged' | 'plan_changed'
        plan?: BillingPlan
      }>('/billing/checkout', { ...(seats ? { seats } : {}), plan })
      .then((r) => r.data),
  /** Change seat quantity on the current Stripe subscription (prorated). */
  updateSeats: (seats: number) =>
    http
      .post<{ seats: number; mode: 'updated' | 'unchanged' | 'plan_changed'; url: null; plan?: BillingPlan }>(
        '/billing/seats',
        { seats },
      )
      .then((r) => r.data),
  /** Stripe Customer Portal — card, invoices, cancel (org must already have a Stripe customer). */
  startBillingPortal: () => http.post<{ url: string }>('/billing/portal').then((r) => r.data),
}

export interface WorkspaceAuditEntry {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
  actor: UserSummary | null
}
