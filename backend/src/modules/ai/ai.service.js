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
  suggestSubtasks,
  summarizeText,
} from './ai.heuristics.js';
import { completeJson, isAiEnabled } from './openai.client.js';

const isSameLocalDay = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
};

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

  const ai = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Write a short daily briefing for a teammate.
Overdue (${facts.overdue.length}): ${facts.overdue.map((i) => i.key).join(', ') || 'none'}
Due today (${facts.dueToday.length}): ${facts.dueToday.map((i) => i.key).join(', ') || 'none'}
In progress (${facts.inProgress.length}): ${facts.inProgress.map((i) => i.key).join(', ') || 'none'}
Return JSON: {"headline": string (one sentence), "focus": string[] (up to 4 concrete next actions), "watch": string[] (up to 3 risks)}`,
  });

  const needsMe = {
    source: ai ? 'openai' : 'heuristic',
    headline:
      ai?.headline ??
      (overdue.length
        ? `You have ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} to clear first.`
        : dueToday.length
          ? `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today — start there.`
          : inProgress.length
            ? `Keep momentum on ${inProgress.length} in-progress task${inProgress.length === 1 ? '' : 's'}.`
            : 'Nothing urgent is assigned to you. Nice.'),
    focus: Array.isArray(ai?.focus)
      ? ai.focus.map(String).slice(0, 4)
      : [
          ...overdue.slice(0, 2).map((issue) => `Unblock or finish ${issue.key}`),
          ...dueToday.slice(0, 2).map((issue) => `Finish ${issue.key} today`),
          ...inProgress.slice(0, 1).map((issue) => `Push ${issue.key} forward`),
        ].slice(0, 4),
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
