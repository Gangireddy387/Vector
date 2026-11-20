import { http } from '@/lib/http'
import type { IssuePriority, IssueType, StatusCategory, UserSummary } from '@/types/models'

export interface IntakeFormSettings {
  askDescription?: boolean
  askPriority?: boolean
  requireApproval?: boolean
  reviewStatusId?: string | null
}

export interface IntakeFormState {
  enabled: boolean
  token: string | null
  title?: string
  intro?: string | null
  issueType?: Exclude<IssueType, 'epic' | 'subtask'>
  defaultPriority?: IssuePriority
  settings?: IntakeFormSettings
  pendingCount?: number
  createdAt?: string
}

export interface PublicIntakeForm {
  title: string
  intro: string | null
  organization: { name: string; logoUrl: string | null }
  project: { key: string; name: string; color: string }
  fields: {
    askDescription: boolean
    askPriority: boolean
    priorities: IssuePriority[]
    defaultPriority: IssuePriority
    requireApproval?: boolean
  }
}

export interface IntakeSubmissionResult {
  key: string
  title: string
  project: { key: string; name: string }
  pendingReview?: boolean
  message?: string
}

export type IntakeFormUpdate = {
  enabled: boolean
  reset?: boolean
  title?: string
  intro?: string | null
  issueType?: Exclude<IssueType, 'epic' | 'subtask'>
  defaultPriority?: IssuePriority
  settings?: IntakeFormSettings
}

export interface IntakeSubmissionRow {
  id: string
  state: 'pending' | 'approved' | 'rejected'
  submitterName: string
  submitterEmail: string
  reviewNote: string | null
  reviewedAt: string | null
  reviewedBy: UserSummary | null
  createdAt: string
  issue: {
    id: string
    key: string
    title: string
    priority: IssuePriority
    status: { id: string; name: string; category: StatusCategory; color: string } | null
    createdAt: string
  } | null
}

export const intakeLinkUrl = (token: string) => `${window.location.origin}/request/${token}`

export const intakeApi = {
  get: (projectId: string) => http.get<{ intake: IntakeFormState }>(`/projects/${projectId}/intake-form`).then((r) => r.data.intake),
  set: (projectId: string, body: IntakeFormUpdate) =>
    http.post<{ intake: IntakeFormState }>(`/projects/${projectId}/intake-form`, body).then((r) => r.data.intake),
  listSubmissions: (projectId: string, state: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') =>
    http
      .get<{ submissions: IntakeSubmissionRow[] }>(`/projects/${projectId}/intake-submissions`, { params: { state } })
      .then((r) => r.data.submissions),
  approve: (projectId: string, submissionId: string, body?: { note?: string; statusId?: string }) =>
    http
      .post<{ submission: IntakeSubmissionRow }>(`/projects/${projectId}/intake-submissions/${submissionId}/approve`, body ?? {})
      .then((r) => r.data.submission),
  reject: (projectId: string, submissionId: string, body?: { note?: string; statusId?: string }) =>
    http
      .post<{ submission: IntakeSubmissionRow }>(`/projects/${projectId}/intake-submissions/${submissionId}/reject`, body ?? {})
      .then((r) => r.data.submission),
  forIssue: (issueId: string) =>
    http.get<{ submission: IntakeSubmissionRow | null }>(`/issues/${issueId}/intake-submission`).then((r) => r.data.submission),
  publicForm: (token: string) => http.get<PublicIntakeForm>(`/intake-forms/${token}`).then((r) => r.data),
  submit: (token: string, body: { name: string; email: string; title: string; description?: string; priority?: IssuePriority; company?: string }) =>
    http.post<IntakeSubmissionResult>(`/intake-forms/${token}/submissions`, body).then((r) => r.data),
}
