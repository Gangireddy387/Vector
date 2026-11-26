import { Component } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

export const listComponents = (projectId) => Component.findAll({ where: { projectId }, order: [['name', 'ASC']] });

async function findComponent(projectId, componentId) {
  const component = await Component.findOne({ where: { id: componentId, projectId } });
  if (!component) throw ApiError.notFound('Component not found');
  return component;
}

export const createComponent = (projectId, input) =>
  Component.create({
    projectId,
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? '#64748b',
  });

export async function updateComponent(projectId, componentId, changes) {
  const component = await findComponent(projectId, componentId);
  return component.update(changes);
}

export async function deleteComponent(projectId, componentId) {
  const component = await findComponent(projectId, componentId);
  await component.destroy();
}
