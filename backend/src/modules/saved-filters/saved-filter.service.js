import { Op } from 'sequelize';
import { SavedFilter } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { assertProjectRole } from '../projects/project-access.js';
import { boardCriteriaSchema, filterCriteriaSchema } from './saved-filter.validation.js';

function sameScope(projectId) {
  return projectId == null ? { [Op.is]: null } : projectId;
}

function normalizeSurface(surface) {
  return surface === 'board' ? 'board' : 'issues';
}

function parseCriteria(surface, criteria) {
  const schema = surface === 'board' ? boardCriteriaSchema : filterCriteriaSchema;
  const parsed = schema.safeParse(criteria ?? {});
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0]?.message || 'Invalid filter criteria');
  }
  return parsed.data;
}

export const listSavedFilters = (userId, projectId, surface = 'issues') => {
  const where = { userId, surface: normalizeSurface(surface) };
  if (projectId) where.projectId = { [Op.or]: [projectId, null] };
  return SavedFilter.findAll({
    where,
    order: [
      ['isDefault', 'DESC'],
      ['name', 'ASC'],
    ],
  });
};

async function clearOtherDefaults(userId, projectId, surface, keepId) {
  await SavedFilter.update(
    { isDefault: false },
    {
      where: {
        userId,
        surface: normalizeSurface(surface),
        projectId: sameScope(projectId ?? null),
        isDefault: true,
        ...(keepId ? { id: { [Op.ne]: keepId } } : {}),
      },
    },
  );
}

async function assertUniqueName(userId, projectId, surface, name, excludeId) {
  const existing = await SavedFilter.findOne({
    where: {
      userId,
      surface: normalizeSurface(surface),
      projectId: sameScope(projectId ?? null),
      name,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
  if (existing) throw ApiError.conflict('You already have a view with that name');
}

export async function createSavedFilter(userId, input) {
  const surface = normalizeSurface(input.surface);
  if (input.projectId) await assertProjectRole(input.projectId, userId);
  await assertUniqueName(userId, input.projectId ?? null, surface, input.name);
  if (input.isDefault) await clearOtherDefaults(userId, input.projectId ?? null, surface);
  return SavedFilter.create({
    userId,
    name: input.name,
    projectId: input.projectId ?? null,
    surface,
    criteria: parseCriteria(surface, input.criteria),
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
    await assertUniqueName(userId, filter.projectId, filter.surface, changes.name, filter.id);
  }
  if (changes.isDefault === true) await clearOtherDefaults(userId, filter.projectId, filter.surface, filter.id);
  const nextCriteria =
    changes.criteria !== undefined ? parseCriteria(filter.surface || 'issues', changes.criteria) : undefined;
  return filter.update({
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(nextCriteria !== undefined ? { criteria: nextCriteria } : {}),
    ...(changes.isDefault !== undefined ? { isDefault: changes.isDefault } : {}),
  });
}

export async function deleteSavedFilter(userId, filterId) {
  const filter = await loadOwnFilter(userId, filterId);
  await filter.destroy();
}
