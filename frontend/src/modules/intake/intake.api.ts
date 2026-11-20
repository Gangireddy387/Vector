import { http } from '@/lib/http'
import type { IssuePriority, IssueType } from '@/types/models'

export interface IntakeFormState {
  enabled: boolean
  token: string | null
  title?: string
  intro?: string | null
  issueType?: Exclude<IssueType, 'epic' | 'subtask'>
  defaultPriority?: IssuePriority
  settings?: { askDescription?: boolean; askPriority?: boolean }
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
  }
}

export interface IntakeSubmissionResult {
  key: string
  title: string
  project: { key: string; name: string }
}

export type IntakeFormUpdate = {
  enabled: boolean
  reset?: boolean
  title?: string
  intro?: string | null
  issueType?: Exclude<IssueType, 'epic' | 'subtask'>
  defaultPriority?: IssuePriority
  settings?: { askDescription?: boolean; askPriority?: boolean }
}

export const intakeLinkUrl = (token: string) => `${window.location.origin}/request/${token}`

export const intakeApi = {
  get: (projectId: string) => http.get<{ intake: IntakeFormState }>(`/projects/${projectId}/intake-form`).then((r) => r.data.intake),
  set: (projectId: string, body: IntakeFormUpdate) =>
    http.post<{ intake: IntakeFormState }>(`/projects/${projectId}/intake-form`, body).then((r) => r.data.intake),
  publicForm: (token: string) => http.get<PublicIntakeForm>(`/intake-forms/${token}`).then((r) => r.data),
  submit: (token: string, body: { name: string; email: string; title: string; description?: string; priority?: IssuePriority; company?: string }) =>
    http.post<IntakeSubmissionResult>(`/intake-forms/${token}/submissions`, body).then((r) => r.data),
}
