import type { PlanFeatureKey } from '@/lib/plan-features'

export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'subtask'
export type IssuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest'
export type StatusCategory = 'todo' | 'in_progress' | 'done'
export type ProjectRole = 'admin' | 'member' | 'viewer'
export type ProjectType = 'scrum' | 'kanban'
export type SprintState = 'planned' | 'active' | 'completed'
export type AutoAssignStrategy = 'none' | 'round_robin' | 'least_loaded' | 'project_lead' | 'default_assignee'
export type IssueLinkType = 'blocks' | 'relates_to' | 'duplicates'
export type RecurringFrequency = 'daily' | 'weekdays' | 'weekly' | 'monthly'
export type ChangeSource = 'user' | 'automation' | 'recurring' | 'system'

export interface UserSummary {
  id: string
  name: string
  email: string
  avatarColor: string
  /** Uploaded profile photo; when absent, initials on `avatarColor` are shown. */
  avatarUrl?: string | null
  title?: string | null
}

export interface QuietHoursPreferences {
  enabled: boolean
  /** Local start `HH:mm` (e.g. 22:00). */
  start: string
  /** Local end `HH:mm` (e.g. 07:00). Overnight windows wrap past midnight. */
  end: string
}

export interface UserPreferences {
  emailNotifications: boolean
  dailyDigest: boolean
  /** Device push for mentions, standups, due dates and similar. Missing means on. */
  pushEnabled?: boolean
  /** Monday morning email with a reports overview summary. */
  weeklyReportsEmail?: boolean
  /** Follow the device's time zone automatically; `false` keeps the zone the user picked. Missing means true. */
  autoTimezone?: boolean
  /** Pause email and device push in this local window (inbox and call rings still work). */
  quietHours?: Partial<QuietHoursPreferences>
  /** Starred projects keyed by organization id. */
  favoriteProjectIds?: Record<string, string[]>
  /** Chosen call ringtone, message and notification sounds and their loudness (custom choices need the plan feature). */
  sounds?: Partial<SoundPreferences>
}

export interface SoundPreferences {
  ringtone: string
  message: string
  notification: string
  /** 0–100. */
  volume: number
  /** The person's own uploaded ringtone (picked with ringtone `custom`). */
  customRingtoneUrl?: string | null
  customRingtoneName?: string | null
}

export type WorkspaceRole = 'admin' | 'member'
export type ColorMode = 'light' | 'dark' | 'system'
/** New organizations wait for the super admin; only approved ones can use the portal. */
export type OrganizationStatus = 'pending' | 'approved' | 'rejected'

/** What the organization's plan allows; limits of `null` are unlimited. */
export interface Entitlements {
  planId: string | null
  planName: string | null
  features: Record<PlanFeatureKey, boolean>
  /** Features the super admin turned on or off for this organization, unlike its plan. */
  customFeatures?: PlanFeatureKey[]
  /** Paid seat count from Stripe when the org bills per seat. */
  billedSeats?: number | null
  limits: { members: number | null; projects: number | null }
}

/** Enterprise SSO settings returned on the organization (plan feature `sso`). */
export interface OrganizationSsoSettings {
  available?: boolean
  enabled: boolean
  enforce: boolean
  provider: 'google' | 'microsoft' | null
  allowedDomains: string[]
  microsoftTenant?: string | null
}

export interface WorkspaceSettings {
  name: string
  /** The organization's address (example.com/:slug); absent for the signed-out default branding. */
  slug?: string
  defaultMode: ColorMode
  logoUrl?: string | null
  /** Theme colour for everyone in the organization: a named theme or a hex colour (null = Vector's own). */
  brandColor?: string | null
  /** When true, members must enable two-factor authentication. */
  requireMfa?: boolean
  sso?: OrganizationSsoSettings
  status?: OrganizationStatus
  rejectionReason?: string | null
  entitlements?: Entitlements
  updatedAt?: string
}

/** An organization the signed-in person belongs to, with their role in it. */
/** Org-scoped permissions granted by admin or a custom role. */
export type OrgPermission =
  | 'workspace.manage'
  | 'workspace.people'
  | 'workspace.roles'
  | 'workspace.billing'
  | 'workspace.structure'
  | 'workspace.audit'
  | 'workspace.support'
  | 'project.create'

export interface OrganizationRole {
  id: string
  organizationId?: string
  name: string
  key: string
  description: string | null
  permissions: OrgPermission[]
  position: number
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  defaultMode: ColorMode
  logoUrl?: string | null
  brandColor?: string | null
  requireMfa?: boolean
  sso?: OrganizationSsoSettings
  status: OrganizationStatus
  rejectionReason?: string | null
  entitlements?: Entitlements
  updatedAt?: string
  role: WorkspaceRole
  customRoleId?: string | null
  /** Effective permissions for the signed-in person in this organization. */
  permissions?: OrgPermission[]
  memberCount?: number
  projectCount?: number
}

/** A group of people inside a department; the lead is always one of its members. */
export interface Team {
  id: string
  departmentId: string
  name: string
  description: string | null
  leadId: string | null
  lead: UserSummary | null
  members: UserSummary[]
  /** Active projects the team owns, and the tasks in them. */
  projectCount: number
  work: WorkCounts
}

/** A part of the organization, led by a department head, holding teams. */
export interface Department {
  id: string
  name: string
  description: string | null
  headId: string | null
  head: UserSummary | null
  teams: Team[]
  /** Projects owned by the department's teams, and the tasks in them. */
  projectCount: number
  work: WorkCounts
}

/** Task counts for a project, a team or a whole department. */
export interface WorkCounts {
  total: number
  todo: number
  inProgress: number
  done: number
  overdue: number
}

/** The projects a team owns, the tasks in them, and the organization's other projects to bring in. */
export interface TeamWork {
  projects: Array<{
    id: string
    key: string
    name: string
    color: string
    type: ProjectType
    lead: UserSummary | null
    work: WorkCounts
  }>
  totals: WorkCounts
  otherProjects: Array<{ id: string; key: string; name: string; color: string; team: { id: string; name: string; departmentName: string | null } | null }>
}

export interface WorkspaceMember extends UserSummary {
  status: User['status']
  workspaceRole: WorkspaceRole
  customRoleId?: string | null
  customRole?: Pick<OrganizationRole, 'id' | 'name' | 'key'> | null
  lastSeenAt: string | null
  createdAt: string
  joinedAt?: string
  projectCount: number
}

export interface User extends UserSummary {
  workspaceRole: WorkspaceRole
  /** The portal owner (SUPER_ADMIN_EMAIL) who approves organizations. */
  isSuperAdmin?: boolean
  /** Signed in with a temporary password from a one-click invitation: must choose their own first. */
  mustChangePassword?: boolean
  /** False for Google/Microsoft-only accounts until they set a local password in Settings. */
  hasPassword?: boolean
  /** How this account can sign in (local password and/or OAuth providers). */
  authProviders?: { password: boolean; google: boolean; microsoft: boolean }
  /** Authenticator app required after password on sign-in. */
  mfaEnabled?: boolean
  /** Current organization requires MFA and this account has not enabled it yet. */
  mfaSetupRequired?: boolean
  status: 'active' | 'invited' | 'disabled'
  timezone: string
  preferences: UserPreferences
  lastSeenAt: string | null
  createdAt: string
  about?: string | null
  location?: string | null
  phone?: string | null
  skills?: string[]
}

export interface StatusSummary {
  id: string
  name: string
  category: StatusCategory
  color: string
}

export interface Status extends StatusSummary {
  projectId: string
  position: number
  wipLimit: number | null
}

export interface Label {
  id: string
  name: string
  color: string
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'url'

export interface CustomField {
  id: string
  projectId: string
  name: string
  key: string
  type: CustomFieldType
  options: string[]
  required: boolean
  description: string | null
  position: number
}

export type CustomFieldValue = string | number | boolean | string[] | null

export interface IssueCustomFieldValue {
  fieldId: string
  value: CustomFieldValue
}

export interface ProjectSettings {
  autoAssign: AutoAssignStrategy
  defaultAssigneeId: string | null
  autoCloseParent: boolean
  carryOverIncomplete: boolean
  sprintLengthDays: number
  dueReminderHours: number
  /** Weekday standup ritual (hours are each member’s local clock). */
  standupEnabled?: boolean
  standupReminderHour?: number
  standupDigestHour?: number
  /** The ready-made sample project (offered to new organizations); it can be deleted in one click. */
  isSample?: boolean
}

export interface ProjectMember extends UserSummary {
  role: ProjectRole
  memberId: string
  status: User['status']
}

export interface ProjectReference {
  id: string
  key: string
  name: string
  color: string
}

export interface Project extends ProjectReference {
  organizationId?: string | null
  description: string | null
  type: ProjectType
  leadId: string | null
  lead: UserSummary | null
  settings: ProjectSettings
  archivedAt: string | null
  myRole: ProjectRole | null
  /** May plan, start and complete sprints: project admins, the project lead and the owning team's lead. */
  canManageSprints?: boolean
  /** False when an organization admin sees the project without having joined it. */
  isMember?: boolean
  /** The team that owns the project, if any. */
  team?: { id: string; name: string } | null
  createdAt: string
  issueSummary?: { total: number; open: number; done: number }
  memberCount?: number
  activeSprint?: { id: string; name: string; endDate: string | null } | null
}

export interface ProjectDetail extends Project {
  statuses: Status[]
  labels: Label[]
  customFields: CustomField[]
  members: ProjectMember[]
}

export interface IssueReference {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  status?: StatusSummary
}

export interface Issue {
  id: string
  projectId: string
  key: string
  number: number
  title: string
  description: string | null
  type: IssueType
  priority: IssuePriority
  statusId: string
  status: StatusSummary
  assigneeId: string | null
  assignee: UserSummary | null
  reporterId: string | null
  parentId: string | null
  parent: IssueReference | null
  sprintId: string | null
  sprint: { id: string; name: string; state: SprintState } | null
  project: ProjectReference
  labels: Label[]
  storyPoints: number | null
  estimateMinutes: number | null
  startDate: string | null
  dueDate: string | null
  position: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
  subtaskProgress: { total: number; done: number }
  commentCount: number
  attachmentCount: number
}

export interface IssueLinkItem {
  id: string
  type: IssueLinkType
  direction: 'outward' | 'inward'
  label: string
  issue: IssueReference
}

export interface IssueDetail extends Omit<Issue, 'subtaskProgress' | 'commentCount' | 'attachmentCount'> {
  reporter: UserSummary | null
  watchers: UserSummary[]
  subtasks: Array<IssueReference & { status: StatusSummary; assignee: UserSummary | null; statusId: string }>
  links: IssueLinkItem[]
  customFieldValues: IssueCustomFieldValue[]
  timeSpentMinutes: number
  isWatching: boolean
}

export interface SprintStats {
  issueCount: number
  doneCount: number
  totalPoints: number
  donePoints: number
}

export interface Sprint {
  id: string
  projectId: string
  name: string
  goal: string | null
  state: SprintState
  startDate: string | null
  endDate: string | null
  completedAt: string | null
  summary: (SprintStats & { carriedOverCount: number }) | null
  stats?: SprintStats
}

export interface Comment {
  id: string
  issueId: string
  authorId: string | null
  author: UserSummary | null
  body: string
  editedAt: string | null
  createdAt: string
}

export interface Attachment {
  id: string
  issueId: string
  fileName: string
  mimeType: string
  size: number
  uploader: UserSummary | null
  createdAt: string
}

export interface WorkLog {
  id: string
  issueId: string
  minutes: number
  note: string | null
  loggedAt: string
  user: UserSummary | null
}

export interface Activity {
  id: string
  projectId: string
  issueId: string | null
  actor: UserSummary | null
  action: string
  field: string | null
  fromValue: string | null
  toValue: string | null
  meta: { source?: ChangeSource; ruleName?: string | null; reason?: string | null; strategy?: string } | null
  createdAt: string
  issue?: Pick<Issue, 'id' | 'key' | 'title' | 'type'> | null
  project?: ProjectReference | null
}

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  /** Set when opened/navigated — not on mark-all-read. Used for workday nudge open rate. */
  clickedAt?: string | null
  createdAt: string
  actor: UserSummary | null
}

export type ConditionField =
  | 'type'
  | 'priority'
  | 'statusId'
  | 'statusCategory'
  | 'fromStatusId'
  | 'assigneeId'
  | 'labelId'
  | 'title'
  | 'storyPoints'

export type ConditionOperator = 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'is_empty' | 'is_not_empty' | 'gt' | 'lt'

export interface AutomationCondition {
  field: ConditionField
  operator: ConditionOperator
  value?: string | number | string[] | null
}

export type AutomationActionType =
  | 'set_status'
  | 'set_priority'
  | 'assign'
  | 'add_labels'
  | 'remove_labels'
  | 'add_comment'
  | 'notify'
  | 'send_email'
  | 'send_webhook'
  | 'set_due_date'
  | 'set_story_points'
  | 'move_to_active_sprint'
  | 'create_subtasks'

export interface AutomationAction {
  type: AutomationActionType
  params: Record<string, unknown>
}

export type AutomationTrigger =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.status_changed'
  | 'issue.assigned'
  | 'issue.priority_changed'
  | 'comment.created'
  | 'issue.due_soon'

export interface AutomationRunRecord {
  at: string
  ok: boolean
  issueKey?: string | null
  trigger?: string
  error?: string
}

export interface AutomationRule {
  id: string
  projectId: string
  name: string
  description: string | null
  enabled: boolean
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  runCount: number
  lastRunAt: string | null
  lastError: string | null
  /** Newest-first snapshot of recent runs (up to 25). */
  recentRuns?: AutomationRunRecord[]
  createdBy: UserSummary | null
}

export interface IssueTemplate {
  id: string
  projectId: string
  name: string
  issueType: IssueType
  titlePrefix: string | null
  body: string | null
  priority: IssuePriority
  storyPoints: number | null
  labelIds: string[]
  subtaskTitles: string[]
}

export interface RecurringTask {
  id: string
  projectId: string
  title: string
  description: string | null
  issueType: IssueType
  priority: IssuePriority
  assigneeId: string | null
  assignee: UserSummary | null
  labelIds: string[]
  frequency: RecurringFrequency
  dayOfWeek: number | null
  dayOfMonth: number | null
  timeOfDay: string
  dueInDays: number | null
  nextRunAt: string
  lastRunAt: string | null
  enabled: boolean
}

export interface SavedFilter {
  id: string
  name: string
  projectId: string | null
  criteria: Record<string, string | number | boolean | null>
  /** Applied automatically when Tasks opens with no URL filters (per person, per project/global). */
  isDefault?: boolean
}
