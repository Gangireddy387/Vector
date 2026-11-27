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

export interface EmbedAppRow {
  id: string
  name: string
  publishableKey: string
  secretPrefix: string
  enabled: boolean
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EmbedSettings {
  sessionExpiresIn: string
  sessionExpiresInLabel: string
  sessionOptions: Array<{ value: string; label: string }>
}

export interface GithubIntegrationSettings {
  available: boolean
  enabled: boolean
  /** When a linked PR merges, move the Vector task to Done (default true). */
  mergeClosesIssue: boolean
  webhookUrl: string
  secretPrefix: string | null
  lastDeliveryAt: string | null
  lastEvent: string | null
  lastError: string | null
  /** Present only when enabling or regenerating. */
  secret?: string
}

export type GitlabIntegrationSettings = GithubIntegrationSettings

/** Dry-run result from POST /workspace/backup/import/preview. */
export interface BackupImportPreview {
  dryRun: true
  source: {
    organizationId: string | null
    slug: string | null
    name: string | null
    exportedAt: string | null
    version?: number | null
  }
  stats: {
    projects: number
    issues: number
    comments: number
    attachments: number
    attachmentsEmbedded?: number
    attachmentsSkipped?: number
    automations: number
    recurringTasks: number
    departments: number
    members: number
  }
  remappedKeys: Array<{ from: string; to: string }>
  skipped: { attachments: number; unknownEmails: string[]; billing: boolean; users: boolean }
  plan: { name: string; projectsAfter: number }
  warnings: string[]
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
    customRoleId?: string | null
    customRole?: Pick<OrganizationRole, 'id' | 'name' | 'key'> | null
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
  exportAuditLog: async (options?: { category?: 'auth' | 'admin'; format?: 'csv' | 'jsonl' }) => {
    const format = options?.format ?? 'csv'
    const response = await http.get<Blob>('/workspace/audit-log/export', {
      params: {
        ...(options?.category ? { category: options.category } : {}),
        format,
      },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const filename = format === 'jsonl' ? 'vector-audit-log.jsonl' : 'vector-audit-log.csv'
    Object.assign(document.createElement('a'), { href: url, download: filename }).click()
    URL.revokeObjectURL(url)
  },
  /** @deprecated Prefer exportAuditLog({ format: 'csv' }) */
  exportAuditLogCsv: async (category?: 'auth' | 'admin') => {
    await workspaceApi.exportAuditLog({ category, format: 'csv' })
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
  embedApps: () =>
    http
      .get<{ apps: EmbedAppRow[]; settings: EmbedSettings }>('/workspace/embed/apps')
      .then((r) => r.data),
  updateEmbedSettings: (payload: { sessionExpiresIn: string }) =>
    http.patch<EmbedSettings>('/workspace/embed/settings', payload).then((r) => r.data),
  createEmbedApp: (payload: { name: string }) =>
    http.post<EmbedAppRow & { secretKey: string }>('/workspace/embed/apps', payload).then((r) => r.data),
  rotateEmbedSecret: (appId: string) =>
    http.post<EmbedAppRow & { secretKey: string }>(`/workspace/embed/apps/${appId}/rotate-secret`).then((r) => r.data),
  updateEmbedApp: (appId: string, payload: { enabled: boolean }) =>
    http.patch<EmbedAppRow>(`/workspace/embed/apps/${appId}`, payload).then((r) => r.data),
  deleteEmbedApp: (appId: string) => http.delete(`/workspace/embed/apps/${appId}`),
  githubIntegration: () => http.get<GithubIntegrationSettings>('/workspace/integrations/github').then((r) => r.data),
  updateGithubIntegration: (payload: { enabled?: boolean; mergeClosesIssue?: boolean }) =>
    http.put<GithubIntegrationSettings>('/workspace/integrations/github', payload).then((r) => r.data),
  regenerateGithubSecret: () =>
    http.post<GithubIntegrationSettings>('/workspace/integrations/github/regenerate-secret').then((r) => r.data),
  gitlabIntegration: () => http.get<GitlabIntegrationSettings>('/workspace/integrations/gitlab').then((r) => r.data),
  updateGitlabIntegration: (payload: { enabled?: boolean; mergeClosesIssue?: boolean }) =>
    http.put<GitlabIntegrationSettings>('/workspace/integrations/gitlab', payload).then((r) => r.data),
  regenerateGitlabSecret: () =>
    http.post<GitlabIntegrationSettings>('/workspace/integrations/gitlab/regenerate-secret').then((r) => r.data),
  /** Full organization JSON backup (projects, issues, comments; attachment files embedded when under size limits). */
  exportBackup: async (slug?: string | null) => {
    const response = await http.get<Blob>('/workspace/backup', { responseType: 'blob' })
    const safe = String(slug || 'workspace').replace(/[^\w.-]+/g, '_')
    const url = URL.createObjectURL(response.data)
    Object.assign(document.createElement('a'), { href: url, download: `vector-${safe}-backup.json` }).click()
    URL.revokeObjectURL(url)
  },
  /** Dry-run: validate a backup and return counts / warnings (no writes). */
  previewBackupImport: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<BackupImportPreview>('/workspace/backup/import/preview', form).then((r) => r.data)
  },
  /** Merge-import a Vector org backup JSON (creates new projects; matches people by email; restores embedded files). */
  importBackup: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http
      .post<{
        projectsCreated: number
        issuesCreated: number
        departmentsCreated: number
        teamsCreated: number
        attachmentsRestored: number
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
