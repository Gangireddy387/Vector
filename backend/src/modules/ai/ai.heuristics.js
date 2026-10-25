/**
 * Rule-based fallbacks used when no OpenAI key is configured.
 * They keep every AI-assisted flow useful offline and in development.
 */

const BUG_WORDS = /\b(bug|fix|error|crash|broken|fails?|failing|exception|regression|not working|500)\b/i;
const STORY_WORDS = /\bas an? .+ i want\b/i;
const EPIC_WORDS = /\b(epic|initiative|program|overhaul|redesign)\b/i;
const URGENT_WORDS = /\b(urgent|asap|critical|outage|security|blocker|data loss|production down)\b/i;
const HIGH_WORDS = /\b(crash|broken|customer|payment|login|checkout|deadline)\b/i;
const LOW_WORDS = /\b(minor|typo|cosmetic|nice to have|polish|copy)\b/i;

export function guessType(text) {
  if (BUG_WORDS.test(text)) return 'bug';
  if (STORY_WORDS.test(text)) return 'story';
  if (EPIC_WORDS.test(text)) return 'epic';
  return 'task';
}

export function guessPriority(text) {
  if (URGENT_WORDS.test(text)) return 'highest';
  if (HIGH_WORDS.test(text)) return 'high';
  if (LOW_WORDS.test(text)) return 'low';
  return 'medium';
}

const POINTS_BY_TYPE = { bug: 2, task: 3, story: 5, epic: 13, subtask: 1 };

export const guessStoryPoints = (type) => POINTS_BY_TYPE[type] ?? 3;

const SUBTASKS_BY_TYPE = {
  bug: ['Reproduce the problem', 'Identify the root cause', 'Implement the fix', 'Add a regression test', 'Verify the fix in staging'],
  story: ['Clarify acceptance criteria', 'Design the solution', 'Implement the change', 'Write automated tests', 'Update documentation'],
  epic: ['Define scope and success metrics', 'Break down into stories', 'Plan milestones', 'Align stakeholders'],
  task: ['Plan the approach', 'Implement', 'Test', 'Review and close'],
};

export function extractChecklist(text = '') {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)]|- \[ \])\s+/.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+(\[[ x]\]\s+)?/i, '').trim())
    .filter((line) => line.length > 2)
    .slice(0, 15);
}

export function suggestSubtasks({ type, description }) {
  const fromChecklist = extractChecklist(description);
  return fromChecklist.length ? fromChecklist : SUBTASKS_BY_TYPE[type] ?? SUBTASKS_BY_TYPE.task;
}

export function draftDescription(title, type) {
  if (type === 'bug') {
    return [
      '## Summary', title, '',
      '## Steps to reproduce', '1. ', '2. ', '',
      '## Expected result', '', '## Actual result', '',
      '## Acceptance criteria', '- [ ] The issue can no longer be reproduced', '- [ ] A regression test covers the scenario',
    ].join('\n');
  }
  return [
    '## Goal', title, '',
    '## Context', 'Why this matters and who benefits.', '',
    '## Acceptance criteria', '- [ ] ', '- [ ] ', '',
    '## Notes', '',
  ].join('\n');
}

export function summarizeText({ title, description, comments, statusName }) {
  const plain = String(description ?? '').replace(/[#*_`>[\]-]/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = plain.match(/[^.!?]+[.!?]?/g) ?? [];
  const summary = sentences.slice(0, 2).join(' ').trim() || title;
  const keyPoints = [`Current status: ${statusName}`, `${comments.length} comment(s) in the discussion`];
  const lastComment = comments.at(-1);
  if (lastComment) keyPoints.push(`Latest comment: "${String(lastComment.body).slice(0, 140)}"`);
  return { summary, keyPoints, nextSteps: extractChecklist(description).slice(0, 3) };
}
