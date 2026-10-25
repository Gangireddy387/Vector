import { IssueTemplate, Label } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

async function assertLabels(projectId, labelIds = []) {
  if (!labelIds.length) return;
  const unique = [...new Set(labelIds)];
  if ((await Label.count({ where: { projectId, id: unique } })) !== unique.length) {
    throw ApiError.badRequest('One or more labels do not belong to this project');
  }
}

async function loadTemplate(projectId, templateId) {
  const template = await IssueTemplate.findOne({ where: { id: templateId, projectId } });
  if (!template) throw ApiError.notFound('Template not found');
  return template;
}

export const listTemplates = (projectId) => IssueTemplate.findAll({ where: { projectId }, order: [['name', 'ASC']] });

export async function createTemplate(projectId, input, actor) {
  await assertLabels(projectId, input.labelIds);
  return IssueTemplate.create({ ...input, projectId, createdById: actor.id });
}

export async function updateTemplate(projectId, templateId, changes) {
  const template = await loadTemplate(projectId, templateId);
  await assertLabels(projectId, changes.labelIds);
  return template.update(changes);
}

export async function deleteTemplate(projectId, templateId) {
  const template = await loadTemplate(projectId, templateId);
  await template.destroy();
}
