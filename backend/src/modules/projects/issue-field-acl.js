import { Project, Team } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { projectRoleOf } from './project-access.js';
import {
  PROJECT_TRANSITION_ACTORS,
  TRANSITION_ACTOR_LABELS,
  actorsForUser,
} from '../workflow-transitions/workflow-transition.service.js';

/**
 * Issue fields that can be restricted per project.
 * `statusId` stays under workflow transition rules.
 * `position` stays free for any editor (board/backlog reorder).
 */
export const ISSUE_FIELD_ACL_KEYS = [
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
];

export const ISSUE_FIELD_ACL_LABELS = {
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
};

/** Sources that bypass field ACL (bots, imports, auto-close). User + roadmap still enforced. */
const BYPASS_SOURCES = new Set(['system', 'automation', 'recurring', 'csv_import', 'github', 'meeting', 'scim']);

function cleanActors(raw) {
  return [...new Set((raw ?? []).filter((actor) => PROJECT_TRANSITION_ACTORS.includes(actor)))];
}

/** Normalize `settings.fieldPermissions` — drop unknown keys / empty actor lists. */
export function cleanFieldPermissions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const next = {};
  for (const key of ISSUE_FIELD_ACL_KEYS) {
    const actors = cleanActors(raw[key]);
    if (actors.length) next[key] = actors;
  }
  return next;
}

/**
 * Which ACL fields the actor may edit given project settings.
 * Missing / empty rule → allowed (today’s member+ behavior).
 */
export function editableIssueFieldsFor({ fieldPermissions, role, userId, projectLeadId, teamLeadId }) {
  const held = new Set(actorsForUser({ role, userId, projectLeadId, teamLeadId }));
  const rules = cleanFieldPermissions(fieldPermissions);
  const map = {};
  for (const key of ISSUE_FIELD_ACL_KEYS) {
    const allowed = rules[key];
    map[key] = !allowed?.length || allowed.some((actor) => held.has(actor));
  }
  return map;
}

/**
 * Reject unauthorized field patches. Call after computing the real diff.
 * @param {object} args
 * @param {object} args.project settings-bearing project (+ optional lead/team)
 * @param {string|null} args.role project role
 * @param {object|null} args.actor user performing the change
 * @param {string[]} args.changedKeys keys that actually change (incl. labelIds / customFields)
 * @param {object} [args.context]
 */
export async function assertIssueFieldChanges({ project, role, actor, changedKeys, context = {} }) {
  if (BYPASS_SOURCES.has(context.source)) return;
  const rules = cleanFieldPermissions(project?.settings?.fieldPermissions);
  if (!Object.keys(rules).length) return;

  const keys = changedKeys.filter((key) => ISSUE_FIELD_ACL_KEYS.includes(key) && rules[key]?.length);
  if (!keys.length) return;

  const held = actorsForUser({
    role: role ?? null,
    userId: actor?.id ?? null,
    projectLeadId: project?.leadId ?? null,
    teamLeadId: project?.team?.leadId ?? null,
  });

  for (const key of keys) {
    const allowed = rules[key];
    if (!allowed.some((actorKey) => held.includes(actorKey))) {
      const labels = allowed.map((actorKey) => TRANSITION_ACTOR_LABELS[actorKey] ?? actorKey);
      const field = ISSUE_FIELD_ACL_LABELS[key] ?? key;
      throw ApiError.forbidden(`Only ${labels.join(' / ')} can change ${field.toLowerCase()}`);
    }
  }
}

/** Resolve role + project row for ACL checks during issue update. */
export async function loadFieldAclContext(projectId, actorId) {
  const [membership, project] = await Promise.all([
    actorId ? projectRoleOf(projectId, actorId) : Promise.resolve(null),
    Project.findByPk(projectId, {
      attributes: ['id', 'leadId', 'teamId', 'settings'],
      include: [{ model: Team, as: 'team', attributes: ['leadId'] }],
    }),
  ]);
  return {
    project,
    role: membership?.role ?? null,
  };
}
