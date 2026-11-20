import { loadIssueWithAccess } from '../projects/project-access.js';
import * as timeReportService from './time-report.service.js';
import * as timerService from './timer.service.js';
import * as workLogService from './worklog.service.js';

export const list = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id);
  res.json({ workLogs: await workLogService.listWorkLogs(issue.id) });
};

export const create = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  res.status(201).json({ workLog: await workLogService.createWorkLog(issue, req.user, req.body) });
};

export const remove = async (req, res) => {
  await workLogService.deleteWorkLog(req.params.workLogId, req.user.id);
  res.status(204).end();
};

export const getTimer = async (req, res) => res.json(await timerService.getActiveTimer(req.user.id));

export const startTimer = async (req, res) => {
  const issue = await loadIssueWithAccess(req.params.issueId, req.user.id, 'member');
  res.status(201).json(await timerService.startTimer(issue, req.user, req.body));
};

export const stopTimer = async (req, res) => res.json(await timerService.stopTimer(req.user, req.body));

export const discardTimer = async (req, res) => res.json(await timerService.discardTimer(req.user.id));

export const timeReport = async (req, res) => res.json(await timeReportService.getTimeReport(req.user, req.filters ?? {}));
