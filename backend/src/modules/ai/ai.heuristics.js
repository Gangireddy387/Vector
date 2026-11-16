/**
 * Rule-based fallbacks used when no OpenAI key is configured (or the API fails).
 * They keep every AI-assisted flow useful offline and in development.
 */

const BUG_WORDS = /\b(bug|fix|error|crash|broken|fails?|failing|exception|regression|not working|500|npe|null pointer)\b/i;
const STORY_WORDS = /\bas an? .+ i want\b/i;
const EPIC_WORDS = /\b(epic|initiative|program|overhaul|redesign|migration)\b/i;
const URGENT_WORDS = /\b(urgent|asap|critical|outage|security|blocker|data loss|production down|sev[-\s]?[12]|p0)\b/i;
const HIGH_WORDS = /\b(crash|broken|customer|payment|login|checkout|deadline|incident)\b/i;
const LOW_WORDS = /\b(minor|typo|cosmetic|nice to have|polish|copy|chore)\b/i;
const ACTION_LINE = /^\s*(?:[-*•]|\d+[.)]|- \[[ x]\])\s+(.+)$/i;
const TODO_WORDS = /\b(todo|next|follow[- ]?up|action|need to|should|please|let'?s|we('ll| will)|i('ll| will))\b/i;

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
    .map((line) => {
      const match = line.match(ACTION_LINE);
      return match ? match[1].replace(/^\[[ x]\]\s+/i, '').trim() : '';
    })
    .filter((line) => line.length > 2)
    .slice(0, 15);
}

/** Pull actionable lines from comments (imperatives / “next” talk). */
export function extractActionHints(comments = []) {
  const hints = [];
  for (const comment of comments) {
    const body = String(comment?.body ?? '');
    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/^[-*•]\s+/, '');
      if (trimmed.length < 8 || trimmed.length > 160) continue;
      if (ACTION_LINE.test(line) || TODO_WORDS.test(trimmed) || /^(fix|update|add|remove|check|verify|ship|deploy|write|review)\b/i.test(trimmed)) {
        hints.push(trimmed.replace(/^please\s+/i, ''));
      }
    }
  }
  return [...new Set(hints)].slice(0, 5);
}

export function suggestSubtasks({ type, description, comments }) {
  const fromChecklist = extractChecklist(description);
  if (fromChecklist.length) return fromChecklist;
  const fromComments = extractActionHints(comments);
  if (fromComments.length) return fromComments;
  return SUBTASKS_BY_TYPE[type] ?? SUBTASKS_BY_TYPE.task;
}

export function draftDescription(title, type) {
  if (type === 'bug') {
    return [
      '## Summary',
      title,
      '',
      '## Steps to reproduce',
      '1. ',
      '2. ',
      '',
      '## Expected result',
      '',
      '## Actual result',
      '',
      '## Acceptance criteria',
      '- [ ] The issue can no longer be reproduced',
      '- [ ] A regression test covers the scenario',
    ].join('\n');
  }
  return [
    '## Goal',
    title,
    '',
    '## Context',
    'Why this matters and who benefits.',
    '',
    '## Acceptance criteria',
    `- [ ] ${title}`,
    '- [ ] Covered by a test or manual check',
    '',
    '## Notes',
    '',
  ].join('\n');
}

function plainSentences(text) {
  return String(text ?? '')
    .replace(/[#*_`>[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^.!?]+[.!?]?/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [];
}

export function summarizeText({ title, description, comments = [], statusName, priority }) {
  const sentences = plainSentences(description);
  const summary =
    sentences.slice(0, 2).join(' ').trim() ||
    `${title} is currently ${String(statusName || 'open').toLowerCase()}${priority ? ` at ${priority} priority` : ''}.`;

  const keyPoints = [`Current status: ${statusName || 'Unknown'}`];
  if (priority) keyPoints.push(`Priority: ${priority}`);
  keyPoints.push(`${comments.length} comment${comments.length === 1 ? '' : 's'} in the discussion`);
  const lastComment = comments.at(-1);
  if (lastComment) keyPoints.push(`Latest comment: "${String(lastComment.body).replace(/\s+/g, ' ').slice(0, 140)}"`);

  const nextSteps = [...extractChecklist(description), ...extractActionHints(comments)].slice(0, 3);
  if (!nextSteps.length && statusName && !/done|closed/i.test(statusName)) {
    nextSteps.push(`Move “${title}” forward from ${statusName}`);
  }

  return { summary, keyPoints: keyPoints.slice(0, 5), nextSteps };
}

/**
 * Extractive meeting summary when OpenAI is off or fails — still produces decisions/actions from
 * transcript/chat/updates/notes so recaps are never a hard dead end.
 */
export function summarizeMeetingMaterial({ title, transcript = [], chat = [], updates = [], notes = '', people = [] }) {
  const lines = [
    ...transcript.map((row) => `${row.speaker?.name ?? 'Someone'}: ${row.text}`),
    ...chat.map((row) => `${row.author?.name ?? 'Someone'}: ${row.body}`),
    ...updates.map((row) => `${row.author?.name ?? 'Someone'}: ${row.body}`),
    notes ? `Host: ${notes}` : '',
  ].filter(Boolean);

  const joined = lines.join('\n');
  const decisions = [];
  const actionItems = [];
  for (const line of lines) {
    const text = line.replace(/^[^:]+:\s*/, '').trim();
    if (!text) continue;
    if (/\b(decid|agreed|we will|we'll|ship on|go with|approved)\b/i.test(text)) {
      decisions.push(text.slice(0, 400));
    }
    if (ACTION_LINE.test(text) || /\b(action|todo|follow[- ]?up|owner|assigned to|will take)\b/i.test(text) || /^(fix|update|add|ship|write|send|schedule)\b/i.test(text)) {
      const ownerMatch = text.match(/\b(?:@|owner[:\s]+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
      const ownerName = ownerMatch && people.some((person) => person.name.toLowerCase().includes(ownerMatch[1].toLowerCase())) ? ownerMatch[1] : null;
      actionItems.push({
        text: text.replace(/^[-*•]\s+/, '').slice(0, 400),
        owner: ownerName,
        due: null,
        priority: /\b(urgent|asap|high)\b/i.test(text) ? 'high' : null,
      });
    }
  }

  const preview = lines
    .slice(0, 6)
    .map((line) => line.slice(0, 180))
    .join(' ');
  const text =
    preview.trim() ||
    `${title || 'This meeting'} had limited notes. Capture captions, chat, or shared updates next time for a richer recap.`;

  return {
    text: text.slice(0, 4000),
    decisions: [...new Set(decisions)].slice(0, 12),
    actionItems: actionItems
      .filter((item, index, all) => all.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) === index)
      .slice(0, 20),
    chapters: [],
    source: 'heuristic',
  };
}
