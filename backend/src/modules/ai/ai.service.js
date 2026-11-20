import { Comment, Issue, Label, StandupUpdate, Status } from '../../database/models.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { listMyWork } from '../issues/issue.service.js';
import { draftAgenda } from '../meetings/meeting.planning.js';
import { listMeetings } from '../meetings/meeting.service.js';
import { entitlementsFor, projectHasFeature } from '../plans/plan.service.js';
import { assertProjectRole, loadIssueWithAccess } from '../projects/project-access.js';
import { listProjects } from '../projects/project.service.js';
import { draftStandup } from '../standups/standup.service.js';
import {
  draftDescription,
  guessPriority,
  guessStoryPoints,
  guessType,
  heuristicClearer,
  heuristicCompletions,
  heuristicExpand,
  heuristicPolish,
  heuristicShorten,
  suggestSubtasks,
  summarizeText,
} from './ai.heuristics.js';
import { buildGroundingBlock } from './ai.grounding.js';
import { completeJsonDetailed, isAiEnabled } from './openai.client.js';

const isSameLocalDay = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
};

const SYSTEM_PROMPT =
  'You are a senior agile project manager assisting inside an issue tracker. Be concise and practical. Always respond with valid JSON only.';

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const clip = (text, size) => {
  const value = String(text ?? '');
  return value.length > size ? `${value.slice(0, size)}\n[…]` : value;
};

const sourceOf = (result) => (result.ok ? 'openai' : result.reason === 'error' ? 'degraded' : 'heuristic');

export const getAiStatus = () => ({ enabled: isAiEnabled(), provider: isAiEnabled() ? 'openai' : 'heuristic' });

/** Turns a one-line idea into a structured issue draft. */
export async function draftIssue(userId, { projectId, title, description }) {
  await assertProjectRole(projectId, userId);
  const labels = await Label.findAll({ where: { projectId }, attributes: ['id', 'name'], raw: true });
  const text = `${title} ${description ?? ''}`;
  const grounding = await buildGroundingBlock({ userId, projectId, queryText: text });

  const result = await completeJsonDetailed({
    system: grounding ? `${SYSTEM_PROMPT}\n\n${grounding}` : SYSTEM_PROMPT,
    user: `Draft a well-structured issue.
Title: ${title}
Notes: ${clip(description ?? 'none', 4000)}
Available labels: ${labels.map((label) => label.name).join(', ') || 'none'}
Return JSON: {"type": one of ${ISSUE_TYPES.filter((t) => t !== 'subtask').join('|')}, "priority": one of ${ISSUE_PRIORITIES.join('|')}, "storyPoints": number (fibonacci), "description": markdown with Goal, Context and Acceptance criteria checklist, "subtasks": string[] (max 6), "labels": string[] chosen from available labels}`,
  });
  const ai = result.data;

  const type = pick(ai?.type, ISSUE_TYPES, guessType(text));
  const labelNames = ai?.labels ?? labels.filter((label) => text.toLowerCase().includes(label.name.toLowerCase())).map((label) => label.name);
  return {
    source: sourceOf(result),
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
  const commentBlock = comments
    .slice(-30)
    .map((comment) => `- ${clip(comment.body, 500)}`)
    .join('\n');
  const result = await completeJsonDetailed({
    system: SYSTEM_PROMPT,
    user: `Summarize this issue for a teammate who is catching up.
Key: ${issue.key} | Status: ${statusName} | Priority: ${issue.priority}
Title: ${issue.title}
Description: ${clip(issue.description ?? 'none', 6000)}
Comments:\n${commentBlock || 'none'}
Return JSON: {"summary": string (2-3 sentences), "keyPoints": string[] (max 5), "nextSteps": string[] (max 3)}`,
  });
  const ai = result.data;
  const fallback = summarizeText({
    title: issue.title,
    description: issue.description,
    comments,
    statusName,
    priority: issue.priority,
  });
  return {
    source: sourceOf(result),
    summary: ai?.summary ?? fallback.summary,
    keyPoints: Array.isArray(ai?.keyPoints) ? ai.keyPoints.map(String).slice(0, 5) : fallback.keyPoints,
    nextSteps: Array.isArray(ai?.nextSteps) ? ai.nextSteps.map(String).slice(0, 3) : fallback.nextSteps,
  };
}

export async function breakdownIssue(userId, issueIdOrKey) {
  const { issue, comments } = await loadIssueContext(issueIdOrKey, userId);
  const existing = await Issue.findAll({ where: { parentId: issue.id }, attributes: ['title'], raw: true });
  const result = await completeJsonDetailed({
    system: SYSTEM_PROMPT,
    user: `Break this ${issue.type} into small, actionable sub-tasks (each completable in under a day).
Title: ${issue.title}
Description: ${clip(issue.description ?? 'none', 6000)}
Existing sub-tasks: ${existing.map((row) => row.title).join('; ') || 'none'}
Return JSON: {"subtasks": string[] (3-8 items, do not repeat existing ones)}`,
  });
  const existingTitles = new Set(existing.map((row) => row.title.toLowerCase()));
  const subtasks = (Array.isArray(result.data?.subtasks) ? result.data.subtasks.map(String) : suggestSubtasks({ type: issue.type, description: issue.description, comments }))
    .filter((title) => !existingTitles.has(title.toLowerCase()))
    .slice(0, 8);
  return { source: sourceOf(result), subtasks };
}

/**
 * Morning briefing: what needs attention, standup drafts for projects still open, and prep for today's meetings.
 */
export async function getDailyBriefing(viewer) {
  const today = toDateOnly(new Date());
  const myWork = await listMyWork(viewer.id);
  const open = myWork.filter((issue) => issue.status.category !== 'done');
  const overdue = open.filter((issue) => issue.dueDate && issue.dueDate < today);
  const dueToday = open.filter((issue) => issue.dueDate === today);
  const inProgress = open.filter((issue) => issue.status.category === 'in_progress');

  const facts = {
    overdue: overdue.slice(0, 8).map((issue) => ({ id: issue.id, key: issue.key, title: issue.title, dueDate: issue.dueDate, projectId: issue.projectId })),
    dueToday: dueToday.slice(0, 8).map((issue) => ({ id: issue.id, key: issue.key, title: issue.title, dueDate: issue.dueDate, projectId: issue.projectId })),
    inProgress: inProgress.slice(0, 8).map((issue) => ({ id: issue.id, key: issue.key, title: issue.title, projectId: issue.projectId })),
  };

  const result = await completeJsonDetailed({
    system: SYSTEM_PROMPT,
    user: `Write a short daily briefing for a teammate.
Overdue (${facts.overdue.length}): ${facts.overdue.map((i) => `${i.key} ${i.title}`).join('; ') || 'none'}
Due today (${facts.dueToday.length}): ${facts.dueToday.map((i) => `${i.key} ${i.title}`).join('; ') || 'none'}
In progress (${facts.inProgress.length}): ${facts.inProgress.map((i) => `${i.key} ${i.title}`).join('; ') || 'none'}
Return JSON: {"headline": string (one sentence), "focus": string[] (up to 4 concrete next actions that mention task keys when relevant), "watch": string[] (up to 3 risks)}`,
  });
  const ai = result.data;

  const heuristicFocus = [
    ...overdue.slice(0, 2).map((issue) => ({ text: `Unblock or finish ${issue.key}`, issueKey: issue.key })),
    ...dueToday.slice(0, 2).map((issue) => ({ text: `Finish ${issue.key} today`, issueKey: issue.key })),
    ...inProgress.slice(0, 1).map((issue) => ({ text: `Push ${issue.key} forward`, issueKey: issue.key })),
  ].slice(0, 4);

  const focusTexts = Array.isArray(ai?.focus) ? ai.focus.map(String).slice(0, 4) : heuristicFocus.map((row) => row.text);
  const knownKeys = [...facts.overdue, ...facts.dueToday, ...facts.inProgress];
  const focus = focusTexts.map((text) => {
    const hit = knownKeys.find((issue) => text.includes(issue.key));
    return { text, issueKey: hit?.key ?? null };
  });

  const needsMe = {
    source: sourceOf(result),
    headline:
      ai?.headline ??
      (overdue.length
        ? `You have ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} to clear first.`
        : dueToday.length
          ? `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today — start there.`
          : inProgress.length
            ? `Keep momentum on ${inProgress.length} in-progress task${inProgress.length === 1 ? '' : 's'}.`
            : 'Nothing urgent is assigned to you. Nice.'),
    focus: focus.map((row) => row.text),
    focusActions: focus,
    watch: Array.isArray(ai?.watch) ? ai.watch.map(String).slice(0, 3) : overdue.length ? ['Overdue work is blocking others'] : [],
    tasks: facts,
  };

  const projects = await listProjects(viewer.id, { includeArchived: false });
  const standupDrafts = [];
  for (const project of projects.slice(0, 6)) {
    if (!(await projectHasFeature(project.id, 'chat'))) continue;
    const posted = await StandupUpdate.findOne({ where: { projectId: project.id, userId: viewer.id, date: today }, attributes: ['id'] });
    if (posted) continue;
    try {
      const draft = await draftStandup(project.id, { id: viewer.id }, today);
      standupDrafts.push({
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        date: today,
        draft,
      });
    } catch {
      // Viewer / archived / empty — skip.
    }
    if (standupDrafts.length >= 3) break;
  }

  const meetingPrep = [];
  const features = entitlementsFor(viewer.organization).features;
  if (features.meetings) {
    try {
      const meetings = await listMeetings(viewer, 'upcoming');
      const todayMeetings = meetings
        .filter((meeting) => meeting.status === 'live' || (meeting.status === 'scheduled' && isSameLocalDay(meeting.startsAt)))
        .slice(0, 3);
      for (const meeting of todayMeetings) {
        let agenda = meeting.agenda;
        if (!agenda) {
          try {
            const drafted = await draftAgenda(viewer, {
              title: meeting.title,
              durationMinutes: meeting.durationMinutes,
              contextType: meeting.context?.type ?? null,
              contextId: meeting.context?.id ?? null,
              meetingId: meeting.id,
            });
            agenda = drafted?.agenda ?? null;
          } catch {
            agenda = null;
          }
        }
        meetingPrep.push({
          meetingId: meeting.id,
          title: meeting.title,
          startsAt: meeting.startsAt,
          agenda: agenda || 'Review open updates, decide owners, and confirm next steps.',
          live: meeting.status === 'live',
        });
      }
    } catch {
      // Meetings unavailable for this organization.
    }
  }

  return { needsMe, standupDrafts, meetingPrep, generatedAt: new Date().toISOString() };
}

const WRITING_SYSTEM =
  'You are a precise writing assistant inside a work app (issues, wiki, comments). Preserve meaning, markdown, and @mentions. Never invent facts. Always respond with valid JSON only.';

const SURFACE_HINT = {
  wiki: 'Tone: clear knowledge-base documentation.',
  issue: 'Tone: crisp task description for an engineering team.',
  comment: 'Tone: short collaborative comment.',
  general: 'Tone: professional and clear.',
};

function mergeSelection(full, selection, rewritten) {
  if (!selection) return rewritten;
  const index = full.indexOf(selection);
  if (index < 0) return rewritten;
  return `${full.slice(0, index)}${rewritten}${full.slice(index + selection.length)}`;
}

function heuristicWriting(mode, target) {
  if (mode === 'complete') {
    const [first] = heuristicCompletions(target, 1);
    return { text: `${target}${first}`, continuation: first };
  }
  if (mode === 'grammar') return { text: heuristicPolish(target, { grammarOnly: true }) };
  if (mode === 'polish') return { text: heuristicPolish(target) };
  if (mode === 'clearer') return { text: heuristicClearer(target) };
  if (mode === 'shorten') return { text: heuristicShorten(target) };
  if (mode === 'expand') return { text: heuristicExpand(target) };
  return { text: target };
}

/**
 * Rewrite or continue writing. Modes: complete | polish | grammar | clearer | shorten | expand.
 * When `selection` is set, only that slice is rewritten and merged back into `text`.
 */
export async function assistWriting(userId, { text, selection, mode, surface = 'general', projectId = null }) {
  const full = String(text ?? '');
  const target = selection?.trim() ? selection : full;
  if (!target.trim() && mode !== 'expand') {
    return { source: 'heuristic', mode, text: full, continuation: null };
  }

  const modeInstructions = {
    complete:
      'Continue the draft with the next 1-3 natural sentences (or a short markdown bullet if the draft ends mid-list). Return only the NEW text to append, not the original.',
    polish: 'Polish wording for clarity and professionalism while keeping the same meaning and structure.',
    grammar: 'Fix spelling, grammar, punctuation, and capitalization only. Do not rewrite style.',
    clearer: 'Make the writing clearer and more direct. Cut filler. Keep markdown structure.',
    shorten: 'Tighten the writing: fewer words, same meaning. Keep essential markdown headings/lists.',
    expand: 'Expand with helpful detail (context, steps, or acceptance criteria) without inventing product facts.',
  };

  const grounding = await buildGroundingBlock({
    userId,
    projectId,
    queryText: full || target,
    includeRetrieval: mode === 'expand' || mode === 'complete' || surface === 'wiki',
  });

  const result = await completeJsonDetailed({
    system: grounding ? `${WRITING_SYSTEM}\n\n${grounding}` : WRITING_SYSTEM,
    temperature: mode === 'complete' ? 0.55 : 0.25,
    maxTokens: mode === 'expand' || mode === 'complete' ? 900 : 1200,
    user: `${SURFACE_HINT[surface] ?? SURFACE_HINT.general}
Mode: ${mode}
Instruction: ${modeInstructions[mode]}
Draft:
"""
${clip(target, 10_000)}
"""
Return JSON: ${
      mode === 'complete'
        ? '{"continuation": string}'
        : '{"text": string}'
    }`,
  });

  if (mode === 'complete') {
    const continuation = typeof result.data?.continuation === 'string' ? result.data.continuation : null;
    if (continuation?.trim()) {
      const prefix = full && !/[\s\n]$/.test(full) ? ' ' : '';
      const piece = continuation.replace(/^\s+/, prefix ? continuation.trimStart() : continuation);
      const normalized = prefix && !piece.startsWith(' ') && !piece.startsWith('\n') ? `${prefix}${piece}` : piece;
      return { source: sourceOf(result), mode, text: `${full}${normalized}`, continuation: normalized };
    }
    const fallback = heuristicWriting('complete', full);
    return { source: sourceOf(result) === 'openai' ? 'degraded' : sourceOf(result), mode, ...fallback };
  }

  const rewritten = typeof result.data?.text === 'string' ? result.data.text : null;
  if (rewritten != null) {
    return { source: sourceOf(result), mode, text: mergeSelection(full, selection, rewritten), continuation: null };
  }

  const fallback = heuristicWriting(mode, target);
  return {
    source: sourceOf(result) === 'openai' ? 'degraded' : 'heuristic',
    mode,
    text: mergeSelection(full, selection, fallback.text),
    continuation: null,
  };
}

/** Several alternate next-phrase suggestions for ghost-text / picker UX. */
export async function suggestNextWords(userId, { text, count = 3, surface = 'general', projectId = null }) {
  const full = String(text ?? '');
  const grounding = await buildGroundingBlock({
    userId,
    projectId,
    queryText: full,
    includeRetrieval: false,
  });
  const result = await completeJsonDetailed({
    system: grounding ? `${WRITING_SYSTEM}\n\n${grounding}` : WRITING_SYSTEM,
    temperature: 0.7,
    maxTokens: 500,
    user: `${SURFACE_HINT[surface] ?? SURFACE_HINT.general}
Suggest ${count} different ways to continue this draft (next few words or one short sentence each). Each suggestion must be ready to append.
Draft:
"""
${clip(full, 8_000)}
"""
Return JSON: {"suggestions": string[]}`,
  });
  const fromAi = Array.isArray(result.data?.suggestions)
    ? result.data.suggestions.map(String).map((item) => item.trim()).filter(Boolean).slice(0, count)
    : [];
  const suggestions = fromAi.length
    ? fromAi.map((item) => (full && !/[\s\n]$/.test(full) && !/^\s/.test(item) ? ` ${item}` : item))
    : heuristicCompletions(full, count);
  return {
    source: fromAi.length ? sourceOf(result) : sourceOf(result) === 'openai' ? 'degraded' : 'heuristic',
    suggestions,
  };
}
