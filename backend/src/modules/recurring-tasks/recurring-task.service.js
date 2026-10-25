import { Op } from 'sequelize';
import { ProjectMember, RecurringTask, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { addDays, toDateOnly } from '../../shared/utils/query.js';
import { createIssue } from '../issues/issue.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { computeNextRunAt } from './recurring-task.schedule.js';

const assigneeInclude = [{ model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES }];

async function loadTask(projectId, taskId) {
  const task = await RecurringTask.findOne({ where: { id: taskId, projectId } });
  if (!task) throw ApiError.notFound('Recurring task not found');
  return task;
}

async function assertAssignee(projectId, assigneeId) {
  if (!assigneeId) return;
  if (!(await ProjectMember.count({ where: { projectId, userId: assigneeId } }))) {
    throw ApiError.badRequest('Assignee must be a project member');
  }
}

export const listRecurringTasks = (projectId) =>
  RecurringTask.findAll({ where: { projectId }, include: assigneeInclude, order: [['nextRunAt', 'ASC']] });

export async function createRecurringTask(projectId, input, actor) {
  await assertAssignee(projectId, input.assigneeId);
  const task = await RecurringTask.create({
    ...input,
    projectId,
    createdById: actor.id,
    nextRunAt: computeNextRunAt(input),
  });
  return RecurringTask.findByPk(task.id, { include: assigneeInclude });
}

export async function updateRecurringTask(projectId, taskId, changes) {
  const task = await loadTask(projectId, taskId);
  await assertAssignee(projectId, changes.assigneeId);
  const scheduleChanged = ['frequency', 'dayOfWeek', 'dayOfMonth', 'timeOfDay', 'enabled'].some((field) => field in changes);
  const merged = { ...task.toJSON(), ...changes };
  await task.update({ ...changes, ...(scheduleChanged ? { nextRunAt: computeNextRunAt(merged) } : {}) });
  return RecurringTask.findByPk(task.id, { include: assigneeInclude });
}

export async function deleteRecurringTask(projectId, taskId) {
  const task = await loadTask(projectId, taskId);
  await task.destroy();
}

async function spawnIssue(task) {
  const reporter = task.createdById ? await User.findByPk(task.createdById) : null;
  const issue = await createIssue(
    {
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      type: task.issueType,
      priority: task.priority,
      assigneeId: task.assigneeId ?? undefined,
      labelIds: task.labelIds,
      dueDate: task.dueInDays != null ? toDateOnly(addDays(new Date(), task.dueInDays)) : null,
    },
    reporter,
    { source: 'recurring' },
  );
  await task.update({ lastRunAt: new Date(), nextRunAt: computeNextRunAt(task, new Date()) });
  return issue;
}

export async function runNow(projectId, taskId) {
  const task = await loadTask(projectId, taskId);
  return spawnIssue(task);
}

/** Scheduler entry point: creates issues for every enabled task that is due. */
export async function runDueRecurringTasks() {
  const dueTasks = await RecurringTask.findAll({ where: { enabled: true, nextRunAt: { [Op.lte]: new Date() } } });
  for (const task of dueTasks) {
    try {
      await spawnIssue(task);
    } catch (error) {
      console.error(`[recurring] task ${task.id} failed:`, error.message);
      await task.update({ nextRunAt: computeNextRunAt(task, new Date()) });
    }
  }
  return dueTasks.length;
}
