import * as aiService from './ai.service.js';

export const status = (_req, res) => res.json(aiService.getAiStatus());
export const draftIssue = async (req, res) => res.json(await aiService.draftIssue(req.user.id, req.body));
export const summarize = async (req, res) => res.json(await aiService.summarizeIssue(req.user.id, req.params.issueId));
export const breakdown = async (req, res) => res.json(await aiService.breakdownIssue(req.user.id, req.params.issueId));
