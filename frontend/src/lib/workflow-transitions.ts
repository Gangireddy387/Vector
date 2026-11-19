import type { ProjectRole, Status, WorkflowTransitionRule } from '@/types/models'

/** Actors that may be allowed to perform a restricted transition. */
export type TransitionActor = 'admin' | 'scrum_master' | 'team_lead' | 'member' | 'viewer'

export const TRANSITION_ACTORS: TransitionActor[] = ['admin', 'scrum_master', 'team_lead', 'member', 'viewer']

export const TRANSITION_ACTOR_META: Record<
  TransitionActor,
  { label: string; hint: string; group: 'admin' | 'leads' | 'members' }
> = {
  admin: { label: 'Admins', hint: 'Project and organization admins', group: 'admin' },
  scrum_master: { label: 'Scrum master', hint: 'The project lead', group: 'leads' },
  team_lead: { label: 'Team lead', hint: 'Lead of the owning team', group: 'leads' },
  member: { label: 'Members', hint: 'All project members', group: 'members' },
  viewer: { label: 'Viewers', hint: 'View-only project members', group: 'members' },
}

export interface TransitionActorContext {
  role?: ProjectRole | null
  userId?: string | null
  projectLeadId?: string | null
  teamLeadId?: string | null
}

function normalizeActorContext(actor?: TransitionActorContext | ProjectRole | null): TransitionActorContext {
  if (!actor) return {}
  if (typeof actor === 'string') return { role: actor }
  return actor
}

/** Actors the current user holds for transition checks. */
export function actorsForUser(ctx: TransitionActorContext | ProjectRole | null | undefined): TransitionActor[] {
  const { role, userId, projectLeadId, teamLeadId } = normalizeActorContext(ctx)
  const actors: TransitionActor[] = []
  if (role === 'admin') actors.push('admin')
  if (userId && projectLeadId === userId) actors.push('scrum_master')
  if (userId && teamLeadId === userId) actors.push('team_lead')
  if (role === 'member') actors.push('member')
  if (role === 'viewer') actors.push('viewer')
  return actors
}

function roleAllowed(rule: WorkflowTransitionRule, ctx: TransitionActorContext | ProjectRole | null | undefined): boolean {
  if (!rule.allowedRoles?.length) return true
  const held = new Set(actorsForUser(ctx))
  if (!held.size && typeof ctx === 'string') {
    // Legacy: only a project role string was passed — still match plain membership roles.
    return rule.allowedRoles.includes(ctx as TransitionActor)
  }
  return rule.allowedRoles.some((actor) => held.has(actor as TransitionActor))
}

/** Statuses an issue may move to from `fromStatusId`. No rule = unrestricted. Always includes current. */
export function allowedStatusesFor(
  statuses: Status[],
  transitions: WorkflowTransitionRule[] | undefined,
  fromStatusId: string | null | undefined,
  actor?: TransitionActorContext | ProjectRole | null,
): Status[] {
  if (!fromStatusId) return statuses
  const rule = (transitions ?? []).find((item) => item.fromStatusId === fromStatusId)
  if (!rule) return statuses
  if (!roleAllowed(rule, actor)) {
    return statuses.filter((status) => status.id === fromStatusId)
  }
  const allowed = new Set([fromStatusId, ...(rule.toStatusIds ?? [])])
  return statuses.filter((status) => allowed.has(status.id))
}

export function transitionRuleFor(
  transitions: WorkflowTransitionRule[] | undefined,
  fromStatusId: string | null | undefined,
): WorkflowTransitionRule | null {
  if (!fromStatusId) return null
  return (transitions ?? []).find((item) => item.fromStatusId === fromStatusId) ?? null
}

export function canPerformTransition(
  rule: WorkflowTransitionRule | null | undefined,
  actor: TransitionActorContext | ProjectRole | null | undefined,
): boolean {
  if (!rule?.allowedRoles?.length) return true
  return roleAllowed(rule, actor)
}
