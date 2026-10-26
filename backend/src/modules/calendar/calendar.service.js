import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { CalendarEvent, Project } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { assertProjectRole } from '../projects/project-access.js';

const DAY_MS = 86_400_000;
/** Enough for the year view. */
const MAX_RANGE_DAYS = 371;
const MAX_REPEATS = 90;
/** Leeway for slow submits and clocks that are slightly off. */
const PAST_GRACE_MS = 5 * 60_000;

const include = [{ model: Project, as: 'project', attributes: ['id', 'name', 'key', 'color'] }];
const order = [
  ['date', 'ASC'],
  ['allDay', 'DESC'],
  ['startTime', 'ASC'],
  ['createdAt', 'ASC'],
];

const parseDay = (value) => new Date(`${value}T00:00:00Z`);
const formatDay = (date) => date.toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / DAY_MS);

export async function listEvents(organizationId, ownerId, { from, to }) {
  const span = daysBetween(from, to);
  if (span < 0) throw ApiError.badRequest('The end of the range must come after its start');
  if (span > MAX_RANGE_DAYS) throw ApiError.badRequest(`Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  return CalendarEvent.findAll({ where: { organizationId, ownerId, date: { [Op.between]: [from, to] } }, include, order });
}

/** All-day events carry no times; timed events need a start and an end after it. */
function normalizeTimes({ allDay, startTime, endTime }) {
  if (allDay) return { allDay: true, startTime: null, endTime: null };
  if (!startTime) throw ApiError.badRequest('Choose a start time, or mark the event as all day');
  if (!endTime) throw ApiError.badRequest('Choose an end time');
  if (endTime <= startTime) throw ApiError.badRequest('The event must end after it starts');
  return { allDay: false, startTime, endTime };
}

/** "Now" in the owner's time zone, a few minutes back so a form submitted right at the start time still passes. */
const ownerNow = (timeZone) => localDateTime(timeZone, new Date(Date.now() - PAST_GRACE_MS));

function assertNotInPast({ date, allDay, startTime }, timeZone) {
  const now = ownerNow(timeZone);
  if (date < now.date) throw ApiError.badRequest('You cannot schedule an event on a past day');
  if (date === now.date && !allDay && startTime < now.time) throw ApiError.badRequest('That start time has already passed today; choose a later time');
}

function hasStarted({ date, allDay, startTime }, timeZone) {
  const now = localDateTime(timeZone);
  return date < now.date || (date === now.date && (allDay || startTime <= now.time));
}

/** An event can only point at a project of this organization that its owner can open. */
async function assertProjectAccess(organizationId, ownerId, projectId) {
  if (!projectId) return;
  const exists = await Project.count({ where: { id: projectId, organizationId } });
  if (!exists) throw ApiError.notFound('Project not found');
  await assertProjectRole(projectId, ownerId);
}

/** The first date plus every repeat up to `until`, inclusive. */
function occurrenceDates(date, repeat) {
  if (!repeat) return [date];
  const span = daysBetween(date, repeat.until);
  if (span < 0) throw ApiError.badRequest('The repeat must end on or after the first day');
  if (span > 366) throw ApiError.badRequest('A repeat can run for at most a year');

  const start = parseDay(date);
  const dates = [date];
  for (let offset = 1; offset <= span; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS);
    const weekday = day.getUTCDay();
    const matches =
      repeat.frequency === 'daily' || (repeat.frequency === 'weekdays' && weekday >= 1 && weekday <= 5) || (repeat.frequency === 'weekly' && offset % 7 === 0);
    if (matches) dates.push(formatDay(day));
  }
  if (dates.length > MAX_REPEATS) throw ApiError.badRequest(`A repeat can create at most ${MAX_REPEATS} events; choose an earlier end date`);
  return dates;
}

export async function createEvents(organizationId, owner, input) {
  const { repeat, ...fields } = input;
  const ownerId = owner.id;
  await assertProjectAccess(organizationId, ownerId, fields.projectId);
  const times = normalizeTimes(fields);
  assertNotInPast({ date: fields.date, ...times }, owner.timezone);
  const dates = occurrenceDates(fields.date, repeat);
  const seriesId = dates.length > 1 ? randomUUID() : null;

  const created = await CalendarEvent.bulkCreate(dates.map((date) => ({ ...fields, ...times, date, organizationId, ownerId, seriesId })));
  return CalendarEvent.findAll({ where: { id: created.map((event) => event.id) }, include, order });
}

async function loadOwnEvent(organizationId, ownerId, eventId) {
  const event = await CalendarEvent.findOne({ where: { id: eventId, organizationId, ownerId } });
  if (!event) throw ApiError.notFound('Event not found');
  return event;
}

/**
 * Past events stay editable (notes, status, title) so they can be tracked, but an event can only be moved to a day
 * and time that are still ahead, and only marked done once it has started.
 */
export async function updateEvent(organizationId, owner, eventId, changes) {
  const event = await loadOwnEvent(organizationId, owner.id, eventId);
  if (changes.projectId !== undefined && changes.projectId !== event.projectId) await assertProjectAccess(organizationId, owner.id, changes.projectId);

  const next = { ...changes };
  if (['allDay', 'startTime', 'endTime'].some((key) => key in changes)) {
    Object.assign(next, normalizeTimes({ allDay: event.allDay, startTime: event.startTime, endTime: event.endTime, ...changes }));
  }
  const when = { date: next.date ?? event.date, allDay: next.allDay ?? event.allDay, startTime: 'startTime' in next ? next.startTime : event.startTime };
  const isRescheduled = when.date !== event.date || when.allDay !== event.allDay || when.startTime !== event.startTime;
  if (isRescheduled) assertNotInPast(when, owner.timezone);

  if (changes.status && changes.status !== event.status) {
    if (changes.status === 'done' && !hasStarted(when, owner.timezone)) throw ApiError.badRequest('You can mark an event as done once it has started');
    next.completedAt = changes.status === 'done' ? new Date() : null;
  }

  await event.update(next);
  return CalendarEvent.findByPk(event.id, { include });
}

/** `following` removes this event and the later repeats in its series. Answers with the ids that were removed. */
export async function deleteEvent(organizationId, ownerId, eventId, scope) {
  const event = await loadOwnEvent(organizationId, ownerId, eventId);
  const where =
    scope === 'following' && event.seriesId
      ? { organizationId, ownerId, seriesId: event.seriesId, date: { [Op.gte]: event.date } }
      : { id: event.id };
  const removed = await CalendarEvent.findAll({ where, attributes: ['id'] });
  await CalendarEvent.destroy({ where });
  return removed.map((item) => item.id);
}
