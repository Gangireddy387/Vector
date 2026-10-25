import { AutomationRule, Label, ProjectMember, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/** Ensures statuses, labels and users referenced by actions belong to the project. */
async function assertRuleReferences(projectId, actions = []) {
  const statusIds = actions.filter((action) => action.type === 'set_status').map((action) => action.params.statusId);
  const labelIds = actions.flatMap((action) => (['add_labels', 'remove_labels'].includes(action.type) ? action.params.labelIds : []));
  const userIds = actions.flatMap((action) => [
    ...(action.params?.userId ? [action.params.userId] : []),
    ...(action.params?.userIds ?? []),
  ]);

  const unique = (items) => [...new Set(items)];
  if (statusIds.length && (await Status.count({ where: { projectId, id: unique(statusIds) } })) !== unique(statusIds).length) {
    throw ApiError.badRequest('An action references a status from another project');
  }
  if (labelIds.length && (await Label.count({ where: { projectId, id: unique(labelIds) } })) !== unique(labelIds).length) {
    throw ApiError.badRequest('An action references a label from another project');
  }
  if (userIds.length && (await ProjectMember.count({ where: { projectId, userId: unique(userIds) } })) !== unique(userIds).length) {
    throw ApiError.badRequest('An action references someone who is not a project member');
  }
}

export const listRules = (projectId) =>
  AutomationRule.findAll({
    where: { projectId },
    include: [{ model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'ASC']],
  });

async function loadRule(projectId, ruleId) {
  const rule = await AutomationRule.findOne({ where: { id: ruleId, projectId } });
  if (!rule) throw ApiError.notFound('Automation rule not found');
  return rule;
}

export async function createRule(projectId, input, actor) {
  await assertRuleReferences(projectId, input.actions);
  return AutomationRule.create({ ...input, projectId, createdById: actor.id });
}

export async function updateRule(projectId, ruleId, changes) {
  const rule = await loadRule(projectId, ruleId);
  if (changes.actions) await assertRuleReferences(projectId, changes.actions);
  return rule.update(changes);
}

export async function deleteRule(projectId, ruleId) {
  const rule = await loadRule(projectId, ruleId);
  await rule.destroy();
}
