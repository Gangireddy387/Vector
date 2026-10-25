import { Label } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

export const listLabels = (projectId) => Label.findAll({ where: { projectId }, order: [['name', 'ASC']] });

async function findLabel(projectId, labelId) {
  const label = await Label.findOne({ where: { id: labelId, projectId } });
  if (!label) throw ApiError.notFound('Label not found');
  return label;
}

export const createLabel = (projectId, input) => Label.create({ ...input, projectId });

export async function updateLabel(projectId, labelId, changes) {
  const label = await findLabel(projectId, labelId);
  return label.update(changes);
}

export async function deleteLabel(projectId, labelId) {
  const label = await findLabel(projectId, labelId);
  await label.destroy();
}
