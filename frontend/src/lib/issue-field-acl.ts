import { actorsForUser, type TransitionActor, type TransitionActorContext } from '@/lib/workflow-transitions'
import type { IssueFieldAclKey, ProjectDetail, ProjectSettings } from '@/types/models'

export const ISSUE_FIELD_ACL_KEYS: IssueFieldAclKey[] = [
  'title',
  'description',
  'assigneeId',
  'priority',
  'type',
  'parentId',
  'sprintId',
  'labelIds',
  'fixVersionIds',
  'affectedVersionIds',
  'storyPoints',
  'estimateMinutes',
  'startDate',
  'dueDate',
  'customFields',
]

export const ISSUE_FIELD_ACL_LABELS: Record<IssueFieldAclKey, string> = {
  title: 'Title',
  description: 'Description',
  assigneeId: 'Assignee',
  priority: 'Priority',
  type: 'Type',
  parentId: 'Epic / parent',
  sprintId: 'Sprint',
  labelIds: 'Labels',
  fixVersionIds: 'Fix versions',
  affectedVersionIds: 'Affected versions',
  storyPoints: 'Story points',
  estimateMinutes: 'Estimate',
  startDate: 'Start date',
  dueDate: 'Due date',
  customFields: 'Custom fields',
}

/** True when the current user may edit this field (coarse canEdit must already be true). */
export function canEditIssueField(
  project: Pick<ProjectDetail, 'editableIssueFields' | 'settings' | 'myRole' | 'leadId' | 'team'> | null | undefined,
  field: IssueFieldAclKey,
  actor?: TransitionActorContext | null,
  coarseEditable = true,
): boolean {
  if (!coarseEditable || !project) return false
  const fromApi = project.editableIssueFields?.[field]
  if (typeof fromApi === 'boolean') return fromApi

  const allowed = project.settings?.fieldPermissions?.[field]
  if (!allowed?.length) return true
  const ctx: TransitionActorContext = actor ?? {
    role: project.myRole,
    projectLeadId: project.leadId,
    teamLeadId: project.team?.leadId ?? null,
  }
  const held = new Set(actorsForUser(ctx))
  return allowed.some((role) => held.has(role as TransitionActor))
}

export function fieldPermissionsOf(settings?: ProjectSettings | null): Partial<Record<IssueFieldAclKey, TransitionActor[]>> {
  const raw = settings?.fieldPermissions ?? {}
  const next: Partial<Record<IssueFieldAclKey, TransitionActor[]>> = {}
  for (const key of ISSUE_FIELD_ACL_KEYS) {
    const actors = (raw[key] ?? []).filter((actor): actor is TransitionActor =>
      ['admin', 'scrum_master', 'team_lead', 'member', 'viewer'].includes(actor),
    )
    if (actors.length) next[key] = [...new Set(actors)]
  }
  return next
}
