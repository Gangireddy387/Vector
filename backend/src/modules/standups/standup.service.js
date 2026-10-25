import { col, fn, Op } from 'sequelize';
import { Activity, Issue, IssueLink, Project, ProjectMember, StandupUpdate, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToProject } from '../../shared/realtime/socket.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { addDaysToDate } from '../../shared/utils/timezone.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { completeJson, isAiEnabled } from '../ai/openai.client.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const ISSUE_SUMMARY = ['id', 'key', 'title', 'type', 'priority', 'statusId', 'assigneeId', 'dueDate', 'completedAt', 'projectId', 'sprintId'];
const PRIORITY_RANK = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
const weekday = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`).getUTCDay();
const startOf = (dateOnly) => new Date(`${dateOnly}T00:00:00`);
const endOf = (dateOnly) => new Date(`${dateOnly}T23:59:59.999`);
const shortDate = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The last working day before `dateOnly` (Friday for a Monday standup). */
export function previousWorkday(dateOnly) {
  let day = addDaysToDate(dateOnly, -1);
  while (weekday(day) === 0 || weekday(day) === 6) day = addDaysToDate(day, -1);
  return day;
}

function assertStandupDate(date) {
  // One day of slack so people ahead of the server's time zone can post for their "today".
  if (date > addDaysToDate(toDateOnly(new Date()), 1)) throw ApiError.badRequest('Standups cannot be written for future days');
}

async function loadStatuses(projectId) {
  const statuses = await Status.findAll({ where: { projectId }, attributes: ['id', 'name', 'color', 'category'] });
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const idsIn = (category) => statuses.filter((status) => status.category === category).map((status) => status.id);
  return { statuses, byId, idsIn };
}

const describeIssue = (issue, statusById) => {
  const status = statusById.get(issue.statusId);
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    type: issue.type,
    priority: issue.priority,
    dueDate: issue.dueDate,
    status: status ? { name: status.name, color: status.color, category: status.category } : null,
  };
};

/**
 * Everything for one standup day: each member's update (or the lack of one) next to what the tracker
 * already knows: what they finished since the previous working day and what they have in progress.
 */
export async function getStandupDay(projectId, date) {
  const previousDate = previousWorkday(date);
  const [memberships, updates, { byId: statusById, idsIn }, recentDays] = await Promise.all([
    ProjectMember.findAll({ where: { projectId }, include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status'] }] }),
    StandupUpdate.findAll({ where: { projectId, date }, include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] }),
    loadStatuses(projectId),
    StandupUpdate.findAll({
      where: { projectId, date: { [Op.lte]: date } },
      attributes: ['date', [fn('COUNT', col('id')), 'count']],
      group: ['date'],
      order: [['date', 'DESC']],
      limit: 30,
      raw: true,
    }),
  ]);

  const people = memberships.filter((membership) => membership.user && membership.user.status !== 'disabled' && (membership.role !== 'viewer' || updates.some((update) => update.userId === membership.userId)));
  const userIds = people.map((membership) => membership.userId);
  const [completed, inProgress, overdue] = userIds.length
    ? await Promise.all([
        Issue.findAll({ where: { projectId, assigneeId: userIds, completedAt: { [Op.gte]: startOf(previousDate), [Op.lte]: endOf(date) } }, attributes: ISSUE_SUMMARY }),
        Issue.findAll({ where: { projectId, assigneeId: userIds, statusId: idsIn('in_progress') }, attributes: ISSUE_SUMMARY }),
        Issue.findAll({ where: { projectId, assigneeId: userIds, statusId: { [Op.notIn]: idsIn('done') }, dueDate: { [Op.lt]: date } }, attributes: ISSUE_SUMMARY }),
      ])
    : [[], [], []];

  const referencedIds = [...new Set(updates.flatMap((update) => update.issueIds ?? []))];
  const referenced = referencedIds.length ? await Issue.findAll({ where: { id: referencedIds }, attributes: ISSUE_SUMMARY }) : [];
  const allStatuses = referenced.some((issue) => !statusById.has(issue.statusId))
    ? new Map((await Status.findAll({ where: { id: referenced.map((issue) => issue.statusId) } })).map((status) => [status.id, status]))
    : statusById;

  const members = people
    .map((membership) => {
      const update = updates.find((row) => row.userId === membership.userId) ?? null;
      const mine = (list) => list.filter((issue) => issue.assigneeId === membership.userId).map((issue) => describeIssue(issue, statusById));
      return {
        user: membership.user.toJSON(),
        role: membership.role,
        update: update ? update.toJSON() : null,
        signals: { completed: mine(completed), inProgress: mine(inProgress), overdue: mine(overdue).length },
      };
    })
    .sort((a, b) => Number(Boolean(b.update)) - Number(Boolean(a.update)) || a.user.name.localeCompare(b.user.name));

  return {
    date,
    previousDate,
    members,
    issues: Object.fromEntries(referenced.map((issue) => [issue.key, describeIssue(issue, new Map([...statusById, ...allStatuses]))])),
    stats: {
      posted: updates.length,
      expected: members.length,
      blockers: updates.filter((update) => update.blockers?.trim()).length,
      completed: completed.length,
    },
    recentDays: recentDays.map((row) => ({ date: typeof row.date === 'string' ? row.date : toDateOnly(new Date(row.date)), count: Number(row.count) })),
  };
}

const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export async function saveStandup(projectId, user, { date, yesterday, today, blockers }) {
  assertStandupDate(date);
  const values = { yesterday: clean(yesterday), today: clean(today), blockers: clean(blockers) };
  const existing = await StandupUpdate.findOne({ where: { projectId, userId: user.id, date } });

  if (!values.yesterday && !values.today && !values.blockers) {
    if (existing) await existing.destroy();
    emitToProject(projectId, 'standup:changed', { date, userId: user.id });
    return null;
  }

  const refs = await resolveIssueRefs(user.id, values.yesterday, values.today, values.blockers);
  const issueIds = refs.map((issue) => issue.id);
  const previousBlockers = existing?.blockers ?? null;
  const update = existing ? await existing.update({ ...values, issueIds }) : await StandupUpdate.create({ projectId, userId: user.id, date, ...values, issueIds });

  if (values.blockers && values.blockers !== previousBlockers) {
    const [project, admins] = await Promise.all([
      Project.findByPk(projectId, { attributes: ['name', 'leadId'] }),
      ProjectMember.findAll({ where: { projectId, role: 'admin' }, attributes: ['userId'], raw: true }),
    ]);
    await notifyUsers({
      userIds: [...admins.map((admin) => admin.userId), project?.leadId],
      actorId: user.id,
      type: 'standup_blocker',
      title: `${user.name} is blocked in ${project?.name ?? 'a project'}`,
      body: values.blockers.slice(0, 280),
      link: `/projects/${projectId}/standup?date=${date}`,
      projectId,
      email: false,
    });
  }

  emitToProject(projectId, 'standup:changed', { date, userId: user.id });
  return StandupUpdate.findByPk(update.id, { include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] });
}

export async function deleteStandup(projectId, userId, date) {
  await StandupUpdate.destroy({ where: { projectId, userId, date } });
  emitToProject(projectId, 'standup:changed', { date, userId });
}

const bullet = (lines) => lines.map((line) => `- ${line}`).join('\n');

/**
 * Drafts a standup from what the tracker recorded since the previous working day:
 * finished, moved and discussed tasks; what is in progress or due next; and what is blocked or overdue.
 */
export async function draftStandup(projectId, user, date = toDateOnly(new Date())) {
  const previousDate = previousWorkday(date);
  const since = startOf(previousDate);
  const { byId: statusById, idsIn } = await loadStatuses(projectId);
  const doneIds = idsIn('done');

  const [completed, statusMoves, discussions, myOpen] = await Promise.all([
    Issue.findAll({ where: { projectId, assigneeId: user.id, completedAt: { [Op.gte]: since } }, attributes: ISSUE_SUMMARY, order: [['completedAt', 'ASC']] }),
    Activity.findAll({ where: { projectId, actorId: user.id, action: 'updated', field: 'status', createdAt: { [Op.gte]: since } }, attributes: ['issueId', 'toValue', 'createdAt'], order: [['createdAt', 'ASC']] }),
    Activity.findAll({ where: { projectId, actorId: user.id, action: 'commented', createdAt: { [Op.gte]: since } }, attributes: ['issueId'] }),
    Issue.findAll({ where: { projectId, assigneeId: user.id, statusId: { [Op.notIn]: doneIds } }, attributes: ISSUE_SUMMARY }),
  ]);

  const completedIds = new Set(completed.map((issue) => issue.id));
  const lastMove = new Map();
  for (const move of statusMoves) if (move.issueId && !completedIds.has(move.issueId)) lastMove.set(move.issueId, move.toValue);
  const discussedIds = [...new Set(discussions.map((row) => row.issueId))].filter((id) => id && !completedIds.has(id) && !lastMove.has(id));
  const touched = await Issue.findAll({ where: { id: [...lastMove.keys(), ...discussedIds] }, attributes: ISSUE_SUMMARY });
  const touchedById = new Map(touched.map((issue) => [issue.id, issue]));

  const inProgressIds = new Set(idsIn('in_progress'));
  const inProgress = myOpen.filter((issue) => inProgressIds.has(issue.statusId));
  const upNext = myOpen
    .filter((issue) => !inProgressIds.has(issue.statusId))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, Math.max(1, 3 - inProgress.length));
  const overdue = myOpen.filter((issue) => issue.dueDate && issue.dueDate < date);

  const blockingLinks = myOpen.length
    ? await IssueLink.findAll({
        where: { type: 'blocks', targetIssueId: myOpen.map((issue) => issue.id) },
        include: [{ model: Issue, as: 'sourceIssue', attributes: ISSUE_SUMMARY }],
      })
    : [];
  const openBlockers = blockingLinks.filter((link) => link.sourceIssue && !doneIds.includes(link.sourceIssue.statusId));
  const myOpenById = new Map(myOpen.map((issue) => [issue.id, issue]));

  const yesterdayLines = [
    ...completed.map((issue) => `Completed ${issue.key} ${issue.title}`),
    ...[...lastMove].map(([id, status]) => touchedById.get(id) && `Moved ${touchedById.get(id).key} ${touchedById.get(id).title} to ${status}`).filter(Boolean),
    ...discussedIds.map((id) => touchedById.get(id) && `Discussed ${touchedById.get(id).key} ${touchedById.get(id).title}`).filter(Boolean),
  ];
  const todayLines = [
    ...inProgress.map((issue) => `Continue ${issue.key} ${issue.title}`),
    ...upNext.map((issue) => `Start ${issue.key} ${issue.title}${issue.dueDate ? ` (due ${shortDate(issue.dueDate)})` : ''}`),
  ];
  const blockerLines = [
    ...openBlockers.map((link) => `${myOpenById.get(link.targetIssueId)?.key} is waiting on ${link.sourceIssue.key} ${link.sourceIssue.title}`),
    ...overdue.map((issue) => `${issue.key} ${issue.title} is overdue (was due ${shortDate(issue.dueDate)})`),
  ];

  const heuristic = {
    yesterday: yesterdayLines.length ? bullet(yesterdayLines) : `- No tracked activity since ${shortDate(previousDate)}`,
    today: todayLines.length ? bullet(todayLines) : '- Pick up the next task from the board',
    blockers: blockerLines.length ? bullet(blockerLines) : '',
  };

  let draft = heuristic;
  let source = 'heuristic';
  if (isAiEnabled() && (yesterdayLines.length || todayLines.length)) {
    const ai = await completeJson({
      system: 'You write short, clear daily standup updates for software teams. Respond with JSON only.',
      user: `Rewrite these facts as a first-person standup update. Keep every task key (like ABC-12) exactly as written, use short markdown bullet points, no filler.
Since ${shortDate(previousDate)}:\n${heuristic.yesterday}
Planned today:\n${heuristic.today}
Blockers:\n${heuristic.blockers || 'none'}
Return JSON: {"yesterday": string, "today": string, "blockers": string (empty string if none)}`,
    });
    if (ai && typeof ai.yesterday === 'string' && typeof ai.today === 'string') {
      draft = { yesterday: ai.yesterday, today: ai.today, blockers: typeof ai.blockers === 'string' ? ai.blockers : heuristic.blockers };
      source = 'openai';
    }
  }

  return {
    source,
    date,
    previousDate,
    ...draft,
    facts: { completed: completed.length, moved: lastMove.size, discussed: discussedIds.length, inProgress: inProgress.length, overdue: overdue.length, blocked: openBlockers.length },
    issues: [...completed, ...touched, ...inProgress, ...upNext].map((issue) => describeIssue(issue, statusById)),
  };
}
