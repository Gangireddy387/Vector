import { Status, WorkflowTransitionRule } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

export const listTransitionRules = (projectId) =>
  WorkflowTransitionRule.findAll({ where: { projectId }, order: [['createdAt', 'ASC']] });

async function statusIdsOf(projectId) {
  const rows = await Status.findAll({ where: { projectId }, attributes: ['id'], raw: true });
  return new Set(rows.map((row) => row.id));
}

function cleanRule(input, validIds) {
  if (!validIds.has(input.fromStatusId)) throw ApiError.badRequest('Unknown from status');
  const toStatusIds = [...new Set((input.toStatusIds ?? []).filter((id) => id !== input.fromStatusId && validIds.has(id)))];
  return {
    fromStatusId: input.fromStatusId,
    toStatusIds,
    requireAssignee: Boolean(input.requireAssignee),
    requireComment: Boolean(input.requireComment),
  };
}

/** Replace the project's transition rules. Empty array = unrestricted workflow. */
export async function replaceTransitionRules(projectId, rules) {
  const validIds = await statusIdsOf(projectId);
  const cleaned = (rules ?? []).map((rule) => cleanRule(rule, validIds));
  const fromIds = cleaned.map((rule) => rule.fromStatusId);
  if (new Set(fromIds).size !== fromIds.length) throw ApiError.badRequest('Each status can only have one transition rule');

  await WorkflowTransitionRule.destroy({ where: { projectId } });
  if (!cleaned.length) return [];
  await WorkflowTransitionRule.bulkCreate(cleaned.map((rule) => ({ ...rule, projectId })));
  return listTransitionRules(projectId);
}

export async function removeRulesForStatus(projectId, statusId) {
  await WorkflowTransitionRule.destroy({ where: { projectId, fromStatusId: statusId } });
  const rules = await WorkflowTransitionRule.findAll({ where: { projectId } });
  for (const rule of rules) {
    const next = (rule.toStatusIds ?? []).filter((id) => id !== statusId);
    if (next.length !== (rule.toStatusIds ?? []).length) await rule.update({ toStatusIds: next });
  }
}

/**
 * Enforces transition rules when status changes.
 * System source bypasses the graph (auto-close parent, privileged remaps).
 */
export async function assertStatusTransition(issue, toStatusId, changes = {}, context = {}) {
  if (!toStatusId || toStatusId === issue.statusId) return;
  if (context.source === 'system') return;

  const rule = await WorkflowTransitionRule.findOne({
    where: { projectId: issue.projectId, fromStatusId: issue.statusId },
  });
  if (!rule) return;

  const allowed = new Set(rule.toStatusIds ?? []);
  if (!allowed.has(toStatusId)) {
    const [from, to] = await Promise.all([
      Status.findByPk(issue.statusId, { attributes: ['name'] }),
      Status.findByPk(toStatusId, { attributes: ['name'] }),
    ]);
    throw ApiError.badRequest(
      `“${from?.name ?? 'Current'}” cannot move to “${to?.name ?? 'that status'}”. Change the workflow transitions in project settings.`,
    );
  }

  if (rule.requireAssignee) {
    const nextAssignee = 'assigneeId' in changes ? changes.assigneeId : issue.assigneeId;
    if (!nextAssignee) throw ApiError.badRequest('Assign someone before moving to this status');
  }

  if (rule.requireComment) {
    const comment = typeof changes.transitionComment === 'string' ? changes.transitionComment.trim() : '';
    if (!comment) {
      throw ApiError.badRequest('Add a comment to explain this status change', { code: 'transition_comment_required' });
    }
  }
}
