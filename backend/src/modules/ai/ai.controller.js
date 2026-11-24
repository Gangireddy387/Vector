import * as aiService from './ai.service.js';

export const status = (_req, res) => res.json(aiService.getAiStatus());
export const draftIssue = async (req, res) => res.json(await aiService.draftIssue(req.user.id, req.body));
export const summarize = async (req, res) => res.json(await aiService.summarizeIssue(req.user.id, req.params.issueId));
export const breakdown = async (req, res) => res.json(await aiService.breakdownIssue(req.user.id, req.params.issueId));
export const nextAction = async (req, res) => res.json(await aiService.nextActionForIssue(req.user.id, req.params.issueId));
export const writingAssist = async (req, res) => res.json(await aiService.assistWriting(req.user.id, req.body));
export const writingSuggest = async (req, res) => res.json(await aiService.suggestNextWords(req.user.id, req.body));
export const dailyBriefing = async (req, res) =>
  res.json(
    await aiService.getDailyBriefing({
      id: req.user.id,
      name: req.user.name,
      organization: req.organization,
      isAdmin: req.organizationRole === 'admin',
    }),
  );
