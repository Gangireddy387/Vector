import { Op } from 'sequelize';
import { ChatMessage, ChatMessageIssue, Issue, IssueLink, Project, StandupUpdate, Status, User } from '../../database/models.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { completeJson, isAiEnabled } from '../ai/openai.client.js';
import { draftStandup, getStandupDay } from '../standups/standup.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

export const ASSISTANT_NAME = 'Vector Assistant';
const TRIGGER = /^\s*(?:\/([a-z-]+)|@(?:vector|assistant|bot)\b)\s*/i;
const PRIORITY_RANK = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };

export const COMMANDS = [
  { name: 'standup', usage: '/standup', description: 'Draft your standup from what you worked on' },
  { name: 'status', usage: '/status VEC-12', description: 'Where a task stands and its latest follow-ups' },
  { name: 'mytasks', usage: '/mytasks', description: 'Your open tasks in this project, most urgent first' },
  { name: 'blockers', usage: '/blockers', description: "Today's blockers, blocked tasks and overdue work" },
  { name: 'summary', usage: '/summary', description: "Today's team standup at a glance" },
  { name: 'help', usage: '/help', description: 'What the assistant can do' },
];

/** Returns the command and the rest of the text when a message is addressed to the assistant. */
export function parseAssistantRequest(body) {
  const match = TRIGGER.exec(body);
  if (!match) return null;
  return { command: match[1]?.toLowerCase() ?? null, text: body.slice(match[0].length).trim() };
}

const todayFor = (user) => (user.timezone ? localDateTime(user.timezone).date : toDateOnly(new Date()));

async function issueCards(issues) {
  if (!issues.length) return [];
  const [statuses, assignees, followups] = await Promise.all([
    Status.findAll({ where: { id: [...new Set(issues.map((issue) => issue.statusId))] }, attributes: ['id', 'name', 'color', 'category'] }),
    User.findAll({ where: { id: issues.map((issue) => issue.assigneeId).filter(Boolean) }, attributes: USER_SUMMARY_ATTRIBUTES }),
    ChatMessageIssue.findAll({ where: { issueId: issues.map((issue) => issue.id) }, attributes: ['issueId'], raw: true }),
  ]);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const userById = new Map(assignees.map((user) => [user.id, user.toJSON()]));
  return issues.map((issue) => {
    const status = statusById.get(issue.statusId);
    return {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      dueDate: issue.dueDate,
      updatedAt: issue.updatedAt,
      status: status ? { name: status.name, color: status.color, category: status.category } : null,
      assignee: userById.get(issue.assigneeId) ?? null,
      followups: followups.filter((row) => row.issueId === issue.id).length,
    };
  });
}

const helpReply = (prefix = '') => ({
  body: `${prefix}Here is what I can do. Mention a task key like VEC-12 in any message and it is recorded on that task as a follow-up.\n${COMMANDS.map((command) => `- ${command.usage}: ${command.description}`).join('\n')}`,
  meta: { type: 'help', commands: COMMANDS },
});

async function standupReply(project, user) {
  const draft = await draftStandup(project.id, user, todayFor(user));
  const { facts } = draft;
  const summary = facts.completed || facts.moved || facts.discussed
    ? `Since your last working day you completed ${facts.completed}, moved ${facts.moved} and discussed ${facts.discussed} task${facts.discussed === 1 ? '' : 's'}.`
    : 'I did not find tracked activity since your last working day, so the draft is short.';
  return {
    body: `Here is a draft standup for ${user.name}. ${summary} Review it and save it to today's standup.\n\n**Yesterday**\n${draft.yesterday}\n\n**Today**\n${draft.today}${draft.blockers ? `\n\n**Blockers**\n${draft.blockers}` : ''}`,
    meta: { type: 'standup_draft', forUserId: user.id, date: draft.date, draft: { yesterday: draft.yesterday, today: draft.today, blockers: draft.blockers }, source: draft.source },
  };
}

async function statusReply(user, text) {
  const issues = await resolveIssueRefs(user.id, text);
  if (!issues.length) return { body: 'Tell me which task, for example: /status VEC-12', meta: { type: 'help', commands: COMMANDS.filter((command) => command.name === 'status') } };
  const cards = await issueCards(issues);
  const lines = cards.map((card) => {
    const owner = card.assignee ? `assigned to ${card.assignee.name}` : 'unassigned';
    const due = card.dueDate ? `, due ${card.dueDate}` : '';
    return `- ${card.key} ${card.title}: ${card.status?.name ?? 'unknown status'}, ${owner}${due}. ${card.followups} follow-up${card.followups === 1 ? '' : 's'} in chat.`;
  });
  return { body: lines.join('\n'), meta: { type: 'issue_status', issues: cards } };
}

async function myTasksReply(project, user) {
  const doneIds = (await Status.findAll({ where: { projectId: project.id, category: 'done' }, attributes: ['id'], raw: true })).map((status) => status.id);
  const issues = await Issue.findAll({ where: { projectId: project.id, assigneeId: user.id, statusId: { [Op.notIn]: doneIds } } });
  const today = todayFor(user);
  issues.sort((a, b) => {
    const overdue = Number(Boolean(b.dueDate && b.dueDate < today)) - Number(Boolean(a.dueDate && a.dueDate < today));
    return overdue || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
  const cards = await issueCards(issues.slice(0, 10));
  return {
    body: cards.length ? `${user.name}, you have ${issues.length} open task${issues.length === 1 ? '' : 's'} in ${project.name}. Most urgent first:` : `${user.name}, you have no open tasks in ${project.name}.`,
    meta: { type: 'issue_list', title: 'Your open tasks', issues: cards, total: issues.length },
  };
}

async function blockersReply(project, user) {
  const today = todayFor(user);
  const doneIds = (await Status.findAll({ where: { projectId: project.id, category: 'done' }, attributes: ['id'], raw: true })).map((status) => status.id);
  const [standups, overdue, links] = await Promise.all([
    StandupUpdate.findAll({ where: { projectId: project.id, date: today, blockers: { [Op.ne]: null } }, include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] }),
    Issue.findAll({ where: { projectId: project.id, statusId: { [Op.notIn]: doneIds }, dueDate: { [Op.lt]: today } }, order: [['dueDate', 'ASC']], limit: 10 }),
    IssueLink.findAll({
      where: { type: 'blocks' },
      include: [
        { model: Issue, as: 'sourceIssue', where: { projectId: project.id, statusId: { [Op.notIn]: doneIds } }, required: true },
        { model: Issue, as: 'targetIssue', where: { statusId: { [Op.notIn]: doneIds } }, required: true },
      ],
      limit: 10,
    }),
  ]);
  const reported = standups.filter((standup) => standup.blockers?.trim()).map((standup) => ({ user: standup.user.toJSON(), text: standup.blockers }));
  const blocked = links.map((link) => ({ blocked: { key: link.targetIssue.key, title: link.targetIssue.title }, by: { key: link.sourceIssue.key, title: link.sourceIssue.title } }));
  const overdueCards = await issueCards(overdue);
  const nothing = !reported.length && !blocked.length && !overdueCards.length;
  const parts = [
    reported.length ? `${reported.length} ${reported.length === 1 ? 'person reported a blocker' : 'people reported blockers'} in today's standup.` : 'Nobody reported a blocker in today\'s standup.',
    blocked.length ? `${blocked.length} task${blocked.length === 1 ? ' is' : 's are'} waiting on another open task.` : '',
    overdueCards.length ? `${overdueCards.length} open task${overdueCards.length === 1 ? ' is' : 's are'} past the due date.` : '',
  ].filter(Boolean);
  return { body: nothing ? 'No blockers: nobody reported one today, nothing is waiting on another task and nothing is overdue.' : parts.join(' '), meta: { type: 'blockers', reported, blocked, overdue: overdueCards } };
}

async function summaryReply(project, user) {
  const day = await getStandupDay(project.id, todayFor(user));
  const missing = day.members.filter((member) => !member.update).map((member) => member.user.name);
  const blockers = day.members.filter((member) => member.update?.blockers).map((member) => ({ user: member.user, text: member.update.blockers }));
  return {
    body: `${day.stats.posted} of ${day.stats.expected} people posted today's standup.${missing.length ? ` Still to post: ${missing.join(', ')}.` : ' Everyone has posted.'} ${day.stats.completed} task${day.stats.completed === 1 ?' was' : 's were'} completed since the last working day.${blockers.length ? ` ${blockers.length} blocker${blockers.length === 1 ? '' : 's'} reported.` : ''}`,
    meta: {
      type: 'standup_summary',
      date: day.date,
      posted: day.stats.posted,
      expected: day.stats.expected,
      missing,
      blockers,
      updates: day.members.filter((member) => member.update).map((member) => ({ user: member.user, today: member.update.today, blockers: member.update.blockers })),
    },
  };
}

/** Free-text questions: answered by the language model when configured, otherwise routed by intent. */
async function questionReply(project, user, text) {
  const refs = await resolveIssueRefs(user.id, text);
  if (isAiEnabled()) {
    const doneIds = (await Status.findAll({ where: { projectId: project.id, category: 'done' }, attributes: ['id'], raw: true })).map((status) => status.id);
    const [open, recent, standups] = await Promise.all([
      Issue.findAll({ where: { projectId: project.id, statusId: { [Op.notIn]: doneIds } }, include: [{ model: User, as: 'assignee', attributes: ['name'] }, { model: Status, as: 'status', attributes: ['name'] }], limit: 60, order: [['updatedAt', 'DESC']] }),
      ChatMessage.findAll({ where: { projectId: project.id, kind: 'user' }, include: [{ model: User, as: 'author', attributes: ['name'] }], order: [['createdAt', 'DESC']], limit: 25 }),
      StandupUpdate.findAll({ where: { projectId: project.id, date: todayFor(user) }, include: [{ model: User, as: 'user', attributes: ['name'] }] }),
    ]);
    const ai = await completeJson({
      system: `You are ${ASSISTANT_NAME}, a helpful project assistant inside the team chat of the "${project.name}" project. Answer briefly and concretely using only the context given. Mention task keys when relevant. Respond with JSON only.`,
      user: `Question from ${user.name}: ${text}
Open tasks:\n${open.map((issue) => `${issue.key} | ${issue.title} | ${issue.status?.name} | ${issue.assignee?.name ?? 'unassigned'} | due ${issue.dueDate ?? '-'} | ${issue.priority}`).join('\n') || 'none'}
Today's standups:\n${standups.map((row) => `${row.user?.name}: today ${row.today ?? '-'}; blockers ${row.blockers ?? 'none'}`).join('\n') || 'none yet'}
Recent chat:\n${recent.reverse().map((message) => `${message.author?.name ?? 'someone'}: ${message.body.slice(0, 200)}`).join('\n') || 'none'}
Return JSON: {"answer": string (markdown, max 120 words)}`,
    });
    if (typeof ai?.answer === 'string') {
      const cards = await issueCards(refs);
      return { body: ai.answer, meta: { type: cards.length ? 'issue_status' : 'answer', issues: cards, source: 'openai' } };
    }
  }

  const lower = text.toLowerCase();
  if (refs.length) return statusReply(user, text);
  if (/stand-?up|yesterday|what did i/.test(lower)) return standupReply(project, user);
  if (/block|stuck|overdue|late/.test(lower)) return blockersReply(project, user);
  if (/my (tasks|work|issues)|assigned to me|what should i/.test(lower)) return myTasksReply(project, user);
  if (/summary|team|who (has|hasn)/.test(lower)) return summaryReply(project, user);
  return helpReply("I'm not sure what you need. ");
}

/** Builds the assistant's reply to a chat message, or returns null when the message is not addressed to it. */
export async function buildAssistantReply(projectId, user, body) {
  const request = parseAssistantRequest(body);
  if (!request) return null;
  const project = await Project.findByPk(projectId, { attributes: ['id', 'name', 'key'] });
  switch (request.command) {
    case 'help':
      return helpReply();
    case 'standup':
      return standupReply(project, user);
    case 'status':
      return statusReply(user, request.text);
    case 'mytasks':
    case 'my-tasks':
      return myTasksReply(project, user);
    case 'blockers':
      return blockersReply(project, user);
    case 'summary':
      return summaryReply(project, user);
    case null:
      return request.text ? questionReply(project, user, request.text) : helpReply();
    default:
      return helpReply(`I don't know the command /${request.command}. `);
  }
}
