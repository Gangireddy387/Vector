import { Issue, Status } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

const CATEGORY_COLORS = { todo: '#64748b', in_progress: '#3b82f6', done: '#22c55e' };

export const listStatuses = (projectId) => Status.findAll({ where: { projectId }, order: [['position', 'ASC']] });

async function findStatus(projectId, statusId) {
  const status = await Status.findOne({ where: { id: statusId, projectId } });
  if (!status) throw ApiError.notFound('Status not found');
  return status;
}

export async function createStatus(projectId, input) {
  const maxPosition = (await Status.max('position', { where: { projectId } })) ?? -1;
  return Status.create({
    ...input,
    projectId,
    color: input.color ?? CATEGORY_COLORS[input.category],
    position: maxPosition + 1,
  });
}

export async function updateStatus(projectId, statusId, changes) {
  const status = await findStatus(projectId, statusId);
  return status.update(changes);
}

export async function reorderStatuses(projectId, statusIds) {
  const statuses = await listStatuses(projectId);
  if (statuses.length !== statusIds.length || !statuses.every((status) => statusIds.includes(status.id))) {
    throw ApiError.badRequest('Provide every status of the project exactly once');
  }
  await Promise.all(statusIds.map((id, index) => Status.update({ position: index }, { where: { id, projectId } })));
  return listStatuses(projectId);
}

export async function deleteStatus(projectId, statusId, moveIssuesTo) {
  const status = await findStatus(projectId, statusId);
  const total = await Status.count({ where: { projectId } });
  if (total <= 1) throw ApiError.badRequest('A workflow needs at least one status');

  const issueCount = await Issue.count({ where: { statusId } });
  if (issueCount) {
    if (!moveIssuesTo || moveIssuesTo === statusId) {
      throw ApiError.badRequest(`Choose where to move the ${issueCount} issue(s) in "${status.name}"`);
    }
    const target = await findStatus(projectId, moveIssuesTo);
    await Issue.update(
      { statusId: target.id, completedAt: target.category === 'done' ? new Date() : null },
      { where: { statusId } },
    );
  }
  await status.destroy();
}
