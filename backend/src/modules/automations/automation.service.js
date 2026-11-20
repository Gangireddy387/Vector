import { AutomationRule, CustomField, Label, ProjectMember, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { normalizeFieldValue } from '../custom-fields/custom-field.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { CUSTOM_FIELD_OPERATORS } from './automation.constants.js';

async function assertCustomFieldUsage(projectId, conditions = [], actions = []) {
  const conditionIds = conditions
    .filter((condition) => condition.field === 'customField' && condition.customFieldId)
    .map((condition) => condition.customFieldId);
  const actionIds = actions
    .filter((action) => action.type === 'set_custom_field')
    .map((action) => action.params.fieldId);
  const ids = [...new Set([...conditionIds, ...actionIds])];
  if (!ids.length) return;

  if (!(await projectHasFeature(projectId, 'customFields'))) {
    throw ApiError.forbidden('The current plan does not include custom fields');
  }

  const fields = await CustomField.findAll({ where: { projectId, id: ids } });
  if (fields.length !== ids.length) {
    throw ApiError.badRequest('A rule references a custom field from another project');
  }
  const byId = new Map(fields.map((field) => [field.id, field]));

  for (const condition of conditions) {
    if (condition.field !== 'customField') continue;
    const field = byId.get(condition.customFieldId);
    if (!field) continue;
    const allowed = CUSTOM_FIELD_OPERATORS[field.type] ?? [];
    if (!allowed.includes(condition.operator)) {
      throw ApiError.badRequest(`Operator “${condition.operator}” is not valid for ${field.name}`);
    }
    if (['is_empty', 'is_not_empty'].includes(condition.operator)) continue;
    if (condition.value === undefined) continue;
    // `equals` on multi_select checks membership of one option (string); wrap for normalize.
    let value = condition.value;
    if (field.type === 'multi_select' && !Array.isArray(value) && value != null && value !== '') {
      value = [value];
    }
    // Normalize to catch bad select options / types (empty allowed for non-required).
    normalizeFieldValue({ ...field.toJSON(), required: false }, value);
  }

  for (const action of actions) {
    if (action.type !== 'set_custom_field') continue;
    const field = byId.get(action.params.fieldId);
    if (!field) continue;
    normalizeFieldValue({ ...field.toJSON(), required: false }, action.params.value);
  }
}

/** Ensures statuses, labels, users and custom fields referenced by the rule belong to the project. */
async function assertRuleReferences(projectId, actions = [], conditions = []) {
  const statusIds = actions.filter((action) => action.type === 'set_status').map((action) => action.params.statusId);
  const labelIds = actions.flatMap((action) =>
    ['add_labels', 'remove_labels'].includes(action.type) ? action.params.labelIds : [],
  );
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
  await assertCustomFieldUsage(projectId, conditions, actions);
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
  await assertRuleReferences(projectId, input.actions, input.conditions ?? []);
  return AutomationRule.create({ ...input, projectId, createdById: actor.id });
}

export async function updateRule(projectId, ruleId, changes) {
  const rule = await loadRule(projectId, ruleId);
  const actions = changes.actions ?? rule.actions;
  const conditions = changes.conditions ?? rule.conditions;
  if (changes.actions || changes.conditions) await assertRuleReferences(projectId, actions, conditions);
  return rule.update(changes);
}

export async function deleteRule(projectId, ruleId) {
  const rule = await loadRule(projectId, ruleId);
  await rule.destroy();
}
