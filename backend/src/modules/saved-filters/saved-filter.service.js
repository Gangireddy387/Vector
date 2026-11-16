import { Op } from 'sequelize';
import { SavedFilter } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { assertProjectRole } from '../projects/project-access.js';

function sameScope(projectId) {
  return projectId == null ? { [Op.is]: null } : projectId;
}

export const listSavedFilters = (userId, projectId) => {
  const where = { userId };
  if (projectId) where.projectId = { [Op.or]: [projectId, null] };
  return SavedFilter.findAll({
    where,
    order: [
      ['isDefault', 'DESC'],
      ['name', 'ASC'],
    ],
  });
};

async function clearOtherDefaults(userId, projectId, keepId) {
  await SavedFilter.update(
    { isDefault: false },
    {
      where: {
        userId,
        projectId: sameScope(projectId ?? null),
        isDefault: true,
        ...(keepId ? { id: { [Op.ne]: keepId } } : {}),
      },
    },
  );
}

async function assertUniqueName(userId, projectId, name, excludeId) {
  const existing = await SavedFilter.findOne({
    where: {
      userId,
      projectId: sameScope(projectId ?? null),
      name,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
  if (existing) throw ApiError.conflict('You already have a view with that name');
}

export async function createSavedFilter(userId, input) {
  if (input.projectId) await assertProjectRole(input.projectId, userId);
  await assertUniqueName(userId, input.projectId ?? null, input.name);
  if (input.isDefault) await clearOtherDefaults(userId, input.projectId ?? null);
  return SavedFilter.create({
    userId,
    name: input.name,
    projectId: input.projectId ?? null,
    criteria: input.criteria,
    isDefault: Boolean(input.isDefault),
  });
}

async function loadOwnFilter(userId, filterId) {
  const filter = await SavedFilter.findOne({ where: { id: filterId, userId } });
  if (!filter) throw ApiError.notFound('Saved filter not found');
  return filter;
}

export async function updateSavedFilter(userId, filterId, changes) {
  const filter = await loadOwnFilter(userId, filterId);
  if (changes.name && changes.name !== filter.name) {
    await assertUniqueName(userId, filter.projectId, changes.name, filter.id);
  }
  if (changes.isDefault === true) await clearOtherDefaults(userId, filter.projectId, filter.id);
  return filter.update({
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.criteria !== undefined ? { criteria: changes.criteria } : {}),
    ...(changes.isDefault !== undefined ? { isDefault: changes.isDefault } : {}),
  });
}

export async function deleteSavedFilter(userId, filterId) {
  const filter = await loadOwnFilter(userId, filterId);
  await filter.destroy();
}
