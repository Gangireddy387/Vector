import { addDaysToDate, localDateTime, zonedTimeToUtc } from '../../shared/utils/timezone.js';

const weekday = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`).getUTCDay();

/** The same day of the month a month later; short months use their last day (31 Jan → 28 Feb → 31 Mar). */
function nextMonth(dateOnly, anchorDay) {
  const [year, month] = dateOnly.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function nextDay(dateOnly, recurrence, anchorDay) {
  if (recurrence === 'weekly') return addDaysToDate(dateOnly, 7);
  if (recurrence === 'monthly') return nextMonth(dateOnly, anchorDay);
  let next = addDaysToDate(dateOnly, 1);
  while (recurrence === 'weekdays' && [0, 6].includes(weekday(next))) next = addDaysToDate(next, 1);
  return next;
}

/**
 * The first start after `after` that follows `startsAt` by the rule (daily, weekdays, weekly, monthly), at the same
 * local time in `timeZone`, so a 09:30 stand-up stays at 09:30 when clocks change.
 */
export function nextStart({ startsAt, recurrence, timeZone, anchorDay, after = new Date() }) {
  const local = localDateTime(timeZone, new Date(startsAt));
  const anchor = anchorDay ?? Number(local.date.slice(8));
  let day = local.date;
  let next = new Date(startsAt);
  for (let guard = 0; guard < 2000; guard += 1) {
    day = nextDay(day, recurrence, anchor);
    next = zonedTimeToUtc(day, local.time, timeZone);
    if (next > after) return next;
  }
  return next;
}
