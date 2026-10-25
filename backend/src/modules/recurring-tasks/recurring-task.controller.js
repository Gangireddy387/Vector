import * as recurringTaskService from './recurring-task.service.js';

export const list = async (req, res) =>
  res.json({ recurringTasks: await recurringTaskService.listRecurringTasks(req.params.projectId) });

export const create = async (req, res) =>
  res.status(201).json({ recurringTask: await recurringTaskService.createRecurringTask(req.params.projectId, req.body, req.user) });

export const update = async (req, res) =>
  res.json({ recurringTask: await recurringTaskService.updateRecurringTask(req.params.projectId, req.params.taskId, req.body) });

export const remove = async (req, res) => {
  await recurringTaskService.deleteRecurringTask(req.params.projectId, req.params.taskId);
  res.status(204).end();
};

export const runNow = async (req, res) => {
  const issue = await recurringTaskService.runNow(req.params.projectId, req.params.taskId);
  res.status(201).json({ issueId: issue.id, key: issue.key });
};
