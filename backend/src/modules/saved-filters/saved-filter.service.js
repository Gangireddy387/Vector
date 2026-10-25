import { Op } from 'sequelize';
import { SavedFilter } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { assertProjectRole } from '../projects/project-access.js';

export const listSavedFilters = (userId, projectId) => {
  const where = { userId };
  if (projectId) where.projectId = { [Op.or]: [projectId, null] };
  return SavedFilter.findAll({ where, order: [['name', 'ASC']] });
};

export async function createSavedFilter(userId, input) {
  if (input.projectId) await assertProjectRole(input.projectId, userId);
  return SavedFilter.create({ ...input, userId });
}

async function loadOwnFilter(userId, filterId) {
  const filter = await SavedFilter.findOne({ where: { id: filterId, userId } });
  if (!filter) throw ApiError.notFound('Saved filter not found');
  return filter;
}

export async function updateSavedFilter(userId, filterId, changes) {
  const filter = await loadOwnFilter(userId, filterId);
  return filter.update(changes);
}

export async function deleteSavedFilter(userId, filterId) {
  const filter = await loadOwnFilter(userId, filterId);
  await filter.destroy();
}
