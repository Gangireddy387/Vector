import { Comment, Issue, Label, Status } from '../../database/models.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { assertProjectRole, loadIssueWithAccess } from '../projects/project-access.js';
import {
  draftDescription,
  guessPriority,
  guessStoryPoints,
  guessType,
  suggestSubtasks,
  summarizeText,
} from './ai.heuristics.js';
import { completeJson, isAiEnabled } from './openai.client.js';

const SYSTEM_PROMPT =
  'You are a senior agile project manager assisting inside an issue tracker. Be concise and practical. Always respond with valid JSON only.';

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const getAiStatus = () => ({ enabled: isAiEnabled(), provider: isAiEnabled() ? 'openai' : 'heuristic' });

/** Turns a one-line idea into a structured issue draft. */
export async function draftIssue(userId, { projectId, title, description }) {
  await assertProjectRole(projectId, userId);
  const labels = await Label.findAll({ where: { projectId }, attributes: ['id', 'name'], raw: true });
  const text = `${title} ${description ?? ''}`;

  const ai = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Draft a well-structured issue.
Title: ${title}
Notes: ${description ?? 'none'}
Available labels: ${labels.map((label) => label.name).join(', ') || 'none'}
Return JSON: {"type": one of ${ISSUE_TYPES.filter((t) => t !== 'subtask').join('|')}, "priority": one of ${ISSUE_PRIORITIES.join('|')}, "storyPoints": number (fibonacci), "description": markdown with Goal, Context and Acceptance criteria checklist, "subtasks": string[] (max 6), "labels": string[] chosen from available labels}`,
  });

  const type = pick(ai?.type, ISSUE_TYPES, guessType(text));
  const labelNames = ai?.labels ?? labels.filter((label) => text.toLowerCase().includes(label.name.toLowerCase())).map((label) => label.name);
  return {
    source: ai ? 'openai' : 'heuristic',
    type,
    priority: pick(ai?.priority, ISSUE_PRIORITIES, guessPriority(text)),
    storyPoints: Number.isInteger(ai?.storyPoints) ? ai.storyPoints : guessStoryPoints(type),
    description: ai?.description ?? (description?.trim() ? description : draftDescription(title, type)),
    subtasks: Array.isArray(ai?.subtasks) ? ai.subtasks.slice(0, 8).map(String) : suggestSubtasks({ type, description }),
    labelIds: labels.filter((label) => labelNames.includes(label.name)).map((label) => label.id),
  };
}

async function loadIssueContext(issueIdOrKey, userId) {
  const issue = await loadIssueWithAccess(issueIdOrKey, userId);
  const [status, comments] = await Promise.all([
    Status.findByPk(issue.statusId, { attributes: ['name'] }),
    Comment.findAll({ where: { issueId: issue.id }, order: [['createdAt', 'ASC']], limit: 50 }),
  ]);
  return { issue, statusName: status?.name ?? 'Unknown', comments };
}

export async function summarizeIssue(userId, issueIdOrKey) {
  const { issue, statusName, comments } = await loadIssueContext(issueIdOrKey, userId);
  const ai = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Summarize this issue for a teammate who is catching up.
Key: ${issue.key} | Status: ${statusName} | Priority: ${issue.priority}
Title: ${issue.title}
Description: ${issue.description ?? 'none'}
Comments:\n${comments.map((comment) => `- ${comment.body}`).join('\n') || 'none'}
Return JSON: {"summary": string (2-3 sentences), "keyPoints": string[] (max 5), "nextSteps": string[] (max 3)}`,
  });
  const fallback = summarizeText({ title: issue.title, description: issue.description, comments, statusName });
  return {
    source: ai ? 'openai' : 'heuristic',
    summary: ai?.summary ?? fallback.summary,
    keyPoints: ai?.keyPoints ?? fallback.keyPoints,
    nextSteps: ai?.nextSteps ?? fallback.nextSteps,
  };
}

export async function breakdownIssue(userId, issueIdOrKey) {
  const { issue } = await loadIssueContext(issueIdOrKey, userId);
  const existing = await Issue.findAll({ where: { parentId: issue.id }, attributes: ['title'], raw: true });
  const ai = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Break this ${issue.type} into small, actionable sub-tasks (each completable in under a day).
Title: ${issue.title}
Description: ${issue.description ?? 'none'}
Existing sub-tasks: ${existing.map((row) => row.title).join('; ') || 'none'}
Return JSON: {"subtasks": string[] (3-8 items, do not repeat existing ones)}`,
  });
  const existingTitles = new Set(existing.map((row) => row.title.toLowerCase()));
  const subtasks = (Array.isArray(ai?.subtasks) ? ai.subtasks.map(String) : suggestSubtasks(issue))
    .filter((title) => !existingTitles.has(title.toLowerCase()));
  return { source: ai ? 'openai' : 'heuristic', subtasks };
}
