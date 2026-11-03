import { Op } from 'sequelize';
import { CalendarEvent, Issue, IssueLink, Meeting, MeetingParticipant, OrganizationMember, Project, Sprint, Status, Team, User } from '../../database/models.js';
import { localDateTime, zonedTimeToUtc } from '../../shared/utils/timezone.js';
import { completeJson } from '../ai/openai.client.js';
import { externalBusyTimes } from '../calendar-sync/calendar-sync.service.js';
import { projectRoleOf } from '../projects/project-access.js';
import { meetingAiAllowed } from './meeting.ai-access.js';

/**
 * Before a meeting: an agenda drafted from the work it is about (the linked project's sprint, blocked and overdue
 * tasks, what got done, and the open action items of the previous meeting), and the times that suit everyone
 * (their meetings, calendars, time zones and working hours).
 */

const DAY_MS = 24 * 60 * 60_000;
const today = () => new Date().toISOString().slice(0, 10);

// --- Agenda ---------------------------------------------------------------------------------------------------------

/** The projects a meeting is about that this person can see (a project, or a team's / department's projects). */
async function contextProjects(viewer, contextType, contextId) {
  if (!contextType || !contextId) return [];
  let projects = [];
  if (contextType === 'project') projects = await Project.findAll({ where: { id: contextId, organizationId: viewer.organization.id } });
  else if (contextType === 'team') projects = await Project.findAll({ where: { teamId: contextId, organizationId: viewer.organization.id, archivedAt: null }, limit: 5 });
  else if (contextType === 'department') {
    const teams = await Team.findAll({ where: { departmentId: contextId }, attributes: ['id'], raw: true });
    projects = teams.length ? await Project.findAll({ where: { teamId: teams.map((team) => team.id), organizationId: viewer.organization.id, archivedAt: null }, limit: 5 }) : [];
  }
  const visible = [];
  for (const project of projects) if (await projectRoleOf(project.id, viewer.id)) visible.push(project);
  return visible;
}

const card = (issue) => `${issue.key} ${issue.title}${issue.assignee ? ` (${issue.assignee.name})` : ''}${issue.dueDate ? `, due ${issue.dueDate}` : ''}`;

async function projectBrief(project) {
  const doneIds = (await Status.findAll({ where: { projectId: project.id, category: 'done' }, attributes: ['id'], raw: true })).map((status) => status.id);
  const open = { projectId: project.id, statusId: { [Op.notIn]: doneIds } };
  const include = [{ model: User, as: 'assignee', attributes: ['name'] }];
  const [sprint, overdue, urgent, done, blocks] = await Promise.all([
    Sprint.findOne({ where: { projectId: project.id, state: 'active' } }),
    Issue.findAll({ where: { ...open, dueDate: { [Op.lt]: today() } }, include, order: [['dueDate', 'ASC']], limit: 8 }),
    Issue.findAll({ where: { ...open, priority: ['high', 'highest'] }, include, order: [['updatedAt', 'DESC']], limit: 8 }),
    Issue.findAll({ where: { projectId: project.id, completedAt: { [Op.gte]: new Date(Date.now() - 7 * DAY_MS) } }, include, order: [['completedAt', 'DESC']], limit: 8 }),
    IssueLink.findAll({
      where: { type: 'blocks' },
      include: [
        { model: Issue, as: 'sourceIssue', where: { statusId: { [Op.notIn]: doneIds } }, required: true },
        { model: Issue, as: 'targetIssue', where: open, required: true },
      ],
      limit: 8,
    }),
  ]);
  let sprintLine = null;
  if (sprint) {
    const [total, finished] = await Promise.all([Issue.count({ where: { sprintId: sprint.id } }), Issue.count({ where: { sprintId: sprint.id, statusId: doneIds } })]);
    sprintLine = `Active sprint "${sprint.name}"${sprint.endDate ? ` ends ${sprint.endDate}` : ''}: ${finished} of ${total} tasks done.`;
  }
  return {
    name: project.name,
    sprint: sprintLine,
    overdue: overdue.map(card),
    urgent: urgent.filter((issue) => !overdue.some((late) => late.id === issue.id)).map(card),
    blocked: blocks.map((link) => `${link.targetIssue.key} ${link.targetIssue.title} is waiting on ${link.sourceIssue.key} ${link.sourceIssue.title}`),
    done: done.map(card),
  };
}

/** Open action items and decisions of the last meeting in the same series or about the same thing. */
async function previousMeeting(viewer, { meetingId, seriesId, contextType, contextId }) {
  const where = { organizationId: viewer.organization.id, status: 'ended', summary: { [Op.ne]: null } };
  if (seriesId) where.seriesId = seriesId;
  else if (contextType && contextId) Object.assign(where, { contextType, contextId });
  else return null;
  if (meetingId) where.id = { [Op.ne]: meetingId };
  const meeting = await Meeting.findOne({ where, order: [['startsAt', 'DESC']] });
  if (!meeting?.summary) return null;
  const items = meeting.summary.actionItems ?? [];
  const linked = items.filter((item) => item.issue?.id).map((item) => item.issue.id);
  const finished = linked.length ? new Set((await Issue.findAll({ where: { id: linked, completedAt: { [Op.ne]: null } }, attributes: ['id'], raw: true })).map((row) => row.id)) : new Set();
  return {
    title: meeting.title,
    date: new Date(meeting.startsAt).toISOString().slice(0, 10),
    decisions: meeting.summary.decisions ?? [],
    openItems: items.filter((item) => !item.issue?.id || !finished.has(item.issue.id)).map((item) => `${item.text}${item.owner ? ` (${item.owner})` : ''}`),
  };
}

function basicAgenda({ title, durationMinutes, briefs, previous }) {
  const parts = [];
  if (previous?.openItems.length) parts.push({ title: `Follow up from ${previous.date}`, lines: previous.openItems.slice(0, 5) });
  for (const brief of briefs) {
    const lines = [brief.sprint, ...brief.blocked.slice(0, 3).map((line) => `Blocked: ${line}`), ...brief.overdue.slice(0, 4).map((line) => `Overdue: ${line}`), ...brief.urgent.slice(0, 3).map((line) => `Priority: ${line}`)].filter(Boolean);
    if (lines.length) parts.push({ title: `${brief.name}: status and risks`, lines });
    if (brief.done.length) parts.push({ title: `${brief.name}: done this week`, lines: brief.done.slice(0, 4) });
  }
  parts.push({ title: 'Decisions and next steps', lines: ['Owners and due dates for each action'] });
  const each = Math.max(5, Math.floor((durationMinutes - 5) / parts.length / 5) * 5);
  return [`${title}`, ...parts.map((part, index) => `${index + 1}. ${part.title} (${index === parts.length - 1 ? 5 : each} min)${part.lines.map((line) => `\n   - ${line}`).join('')}`)].join('\n');
}

/**
 * An agenda for a meeting being scheduled: `{ agenda, source }` ('ai' when the assistant wrote it, 'basic' when it
 * was put together from the same facts without it).
 */
export async function draftAgenda(viewer, { title = 'Meeting', durationMinutes = 30, contextType = null, contextId = null, meetingId = null, seriesId = null }) {
  const projects = await contextProjects(viewer, contextType, contextId);
  const [briefs, previous] = await Promise.all([Promise.all(projects.map(projectBrief)), previousMeeting(viewer, { meetingId, seriesId, contextType, contextId })]);
  const facts = { title, durationMinutes, briefs, previous };
  if (!(await meetingAiAllowed(viewer.organization.id))) return { agenda: basicAgenda(facts), source: 'basic' };
  const material = [
    `Meeting: ${title} (${durationMinutes} minutes)`,
    previous && `Previous meeting on ${previous.date} ("${previous.title}"):\nDecisions:\n${previous.decisions.map((line) => `- ${line}`).join('\n') || '- none'}\nOpen action items:\n${previous.openItems.map((line) => `- ${line}`).join('\n') || '- none'}`,
    ...briefs.map((brief) =>
      [
        `Project ${brief.name}:`,
        brief.sprint,
        brief.blocked.length && `Blocked:\n${brief.blocked.map((line) => `- ${line}`).join('\n')}`,
        brief.overdue.length && `Overdue:\n${brief.overdue.map((line) => `- ${line}`).join('\n')}`,
        brief.urgent.length && `High priority open:\n${brief.urgent.map((line) => `- ${line}`).join('\n')}`,
        brief.done.length && `Done in the last 7 days:\n${brief.done.map((line) => `- ${line}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
  const answer = await completeJson({
    system: `You prepare agendas for work meetings. Reply in JSON: {"agenda": string}. Plain text: numbered topics with a time box in minutes that add up to the meeting length, each with 1 to 3 short "- " lines naming the tasks (by key) or people to discuss. Start with follow-ups from the previous meeting when there are open items, put blockers and risks before status, end with decisions and next steps. Use only the facts given; when there are few, keep the agenda short. Write in English unless the meeting title is in another language.`,
    user: material,
  });
  const agenda = typeof answer?.agenda === 'string' ? answer.agenda.trim().slice(0, 4000) : '';
  return agenda ? { agenda, source: 'ai' } : { agenda: basicAgenda(facts), source: 'basic' };
}

// --- Finding a time -------------------------------------------------------------------------------------------------

const SLOT_MINUTES = 30;
const WORK = { start: 9 * 60, end: 18 * 60 };
const CORE = { start: 10 * 60, end: 16 * 60 + 30 };
const LUNCH = { start: 13 * 60, end: 14 * 60 };
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

function localClock(timeZone, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { weekday: WEEKDAY[parts.weekday] ?? 1, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const overlaps = (start, end, slot) => start < slot.end && end > slot.start;

/** Busy times of these people between `from` and `to`, from meetings, their Vector calendar and connected calendars. */
async function busyTimes(people, from, to) {
  const ids = people.map((person) => person.id);
  const busy = new Map(ids.map((id) => [id, []]));
  const add = (userId, start, end) => busy.get(userId)?.push({ start: new Date(start), end: new Date(end) });

  const participations = await MeetingParticipant.findAll({ where: { userId: ids }, attributes: ['userId', 'meetingId'], raw: true });
  const meetings = await Meeting.findAll({
    where: {
      status: ['scheduled', 'live'],
      startsAt: { [Op.lt]: to, [Op.gte]: new Date(from.getTime() - DAY_MS) },
      [Op.or]: [{ hostId: ids }, { id: [...new Set(participations.map((row) => row.meetingId))] }],
    },
    attributes: ['id', 'hostId', 'startsAt', 'durationMinutes'],
  });
  for (const meeting of meetings) {
    const start = new Date(meeting.startsAt);
    const end = new Date(start.getTime() + meeting.durationMinutes * 60_000);
    const attendees = new Set([meeting.hostId, ...participations.filter((row) => row.meetingId === meeting.id).map((row) => row.userId)]);
    for (const userId of attendees) add(userId, start, end);
  }

  const dates = [];
  for (let day = new Date(from.getTime() - DAY_MS); day <= to; day = new Date(day.getTime() + DAY_MS)) dates.push(day.toISOString().slice(0, 10));
  const events = await CalendarEvent.findAll({ where: { ownerId: ids, date: dates, meetingId: null } });
  const zoneOf = new Map(people.map((person) => [person.id, person.timezone || 'UTC']));
  for (const event of events) {
    const zone = zoneOf.get(event.ownerId);
    if (event.allDay || !event.startTime) add(event.ownerId, zonedTimeToUtc(event.date, '00:00', zone), zonedTimeToUtc(event.date, '23:59', zone));
    else add(event.ownerId, zonedTimeToUtc(event.date, event.startTime.slice(0, 5), zone), zonedTimeToUtc(event.date, (event.endTime ?? event.startTime).slice(0, 5), zone));
  }

  const external = await externalBusyTimes(ids, from, to);
  for (const [userId, slots] of external) for (const slot of slots) add(userId, slot.start, slot.end);
  return { busy, checkedCalendars: external.size };
}

/**
 * Times in the next `days` days when everyone is free, best first: inside everyone's working hours (9:00–18:00 on
 * weekdays, in each person's own time zone), away from lunch, sooner rather than later. `[{ startsAt, endsAt,
 * everyoneWorking, outside: [names] }]`.
 */
export async function suggestTimes(viewer, { participantIds = [], durationMinutes = 30, from = null, days = 7 }) {
  const memberIds = (
    await OrganizationMember.findAll({ where: { organizationId: viewer.organization.id, status: 'active', userId: [...new Set([viewer.id, ...participantIds])] }, attributes: ['userId'], raw: true })
  ).map((row) => row.userId);
  const people = await User.findAll({ where: { id: memberIds }, attributes: ['id', 'name', 'timezone'], raw: true });
  const span = Math.min(Math.max(days, 1), 14);
  const earliest = Math.max(from ? new Date(from).getTime() : 0, Date.now() + 15 * 60_000);
  const start = new Date(Math.ceil(earliest / (SLOT_MINUTES * 60_000)) * SLOT_MINUTES * 60_000);
  const end = new Date(start.getTime() + span * DAY_MS);
  const { busy, checkedCalendars } = await busyTimes(people, start, end);

  const candidates = [];
  for (let at = start.getTime(); at + durationMinutes * 60_000 <= end.getTime(); at += SLOT_MINUTES * 60_000) {
    const slot = { start: new Date(at), end: new Date(at + durationMinutes * 60_000) };
    if (people.some((person) => busy.get(person.id).some((item) => overlaps(item.start, item.end, slot)))) continue;
    let score = 100 - Math.floor((at - start.getTime()) / DAY_MS) * 2;
    const outside = [];
    for (const person of people) {
      const begin = localClock(person.timezone, slot.start);
      const finish = begin.minutes + durationMinutes;
      const working = begin.weekday >= 1 && begin.weekday <= 5 && begin.minutes >= WORK.start && finish <= WORK.end;
      if (!working) {
        outside.push(person.name);
        score -= 40;
        continue;
      }
      if (begin.minutes >= CORE.start && finish <= CORE.end) score += 3;
      if (begin.minutes < LUNCH.end && finish > LUNCH.start) score -= 6;
    }
    candidates.push({ startsAt: slot.start.toISOString(), endsAt: slot.end.toISOString(), score, outside });
  }

  const everyoneWorking = candidates.filter((item) => !item.outside.length);
  const pool = everyoneWorking.length ? everyoneWorking : candidates;
  const perDay = new Map();
  const chosen = [];
  for (const item of [...pool].sort((a, b) => b.score - a.score || a.startsAt.localeCompare(b.startsAt))) {
    const day = localDateTime(people.find((person) => person.id === viewer.id)?.timezone ?? 'UTC', new Date(item.startsAt)).date;
    if ((perDay.get(day) ?? 0) >= 2) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    chosen.push(item);
    if (chosen.length >= 6) break;
  }
  return {
    people: people.length,
    checkedCalendars,
    suggestions: chosen
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(({ startsAt, endsAt, outside }) => ({ startsAt, endsAt, everyoneWorking: !outside.length, outside })),
  };
}