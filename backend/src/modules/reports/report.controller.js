import * as reportService from './report.service.js';
import * as trackingService from './tracking.service.js';

export const overview = async (req, res) => res.json(await reportService.getReportOverview(req.user.id, req.filters));
export const progress = async (req, res) => res.json(await reportService.getProjectProgress(req.params.projectId));
export const summary = async (req, res) => res.json(await reportService.getProjectSummary(req.params.projectId, req.filters));
export const burndown = async (req, res) => res.json(await reportService.getSprintBurndown(req.params.projectId, req.params.sprintId));
export const velocity = async (req, res) => res.json(await reportService.getVelocity(req.params.projectId));
export const modules = async (req, res) => res.json(await trackingService.getProjectModules(req.params.projectId));
export const sprints = async (req, res) => res.json(await trackingService.getProjectSprints(req.params.projectId));
export const performance = async (req, res) => res.json(await trackingService.getTeamPerformance(req.user, req.filters));
export const memberReview = async (req, res) => res.json(await trackingService.getMemberReview(req.user, req.params.userId, req.filters));
